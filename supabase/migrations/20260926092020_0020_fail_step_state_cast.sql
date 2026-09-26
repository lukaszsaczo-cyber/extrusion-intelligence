-- 0020: step 39 wrote coalesce(text, verification_state), a type error caught by
-- supabase/tests/fail_loop.sql. Same function as 0019 with the state cast to text.

create or replace function public.record_fail_step(p_case uuid, p_step public.fail_step, p_ref uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record; v_last record; v_diag record; v_x record; r record;
  v_id uuid; v_payload jsonb := '{}'::jsonb; v_note text; v_machine uuid; v_rows jsonb; v_check jsonb; v_close boolean := false;
  v_diag_status text; v_pass boolean;
begin
  select * into c from public.fail_cases where id = p_case for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(c.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'OPEN' then raise exception 'fail_closed: the case is closed' using errcode = '23514'; end if;
  select * into v_last from private.fail_last_step(p_case);
  select * into v_diag from private.fail_latest(p_case, 'DIAGNOSIS');
  v_diag_status := v_diag.payload ->> 'status';
  v_pass := c.outcome = 'VERIFIED_PASS' and c.outcome_evidence_saved;

  -- order A. After ODŚWIEŻENIE: NAPRAWA only with a named cause; without one, diagnose
  -- again on the refreshed clean state (never a forced cause). After RAPORT: 38..AUDIT
  -- only for a verified PASS with saved evidence (otherwise RAPORT closes the case).
  if not coalesce((v_last.step = 'DECOMPOSITION' and p_step = 'DIAGNOSIS')
       or (v_last.step = 'DIAGNOSIS' and p_step = 'EXTRACT')
       or (v_last.step = 'EXTRACT' and p_step = 'PURGE')
       or (v_last.step = 'PURGE' and p_step = 'CONSOLIDATE')
       or (v_last.step = 'CONSOLIDATE' and p_step = 'STATE_REFRESH')
       or (v_last.step = 'STATE_REFRESH' and v_diag_status = 'DIAGNOSED' and p_step = 'INTERVENTION')
       or (v_last.step = 'STATE_REFRESH' and v_diag_status <> 'DIAGNOSED' and p_step = 'DIAGNOSIS')
       or (v_last.step = 'INTERVENTION' and p_step = 'CONTROLLED_TEST')
       or (v_last.step = 'CONTROLLED_TEST' and p_step = 'VERIFICATION')
       or (v_last.step = 'VERIFICATION' and p_step = 'REPORT')
       or (v_last.step = 'REPORT' and v_pass and p_step = 'FILTER')
       or (v_last.step = 'FILTER' and p_step = 'VERIFY_PERSIST')
       or (v_last.step = 'VERIFY_PERSIST' and p_step = 'LOCK')
       or (v_last.step = 'LOCK' and p_step = 'CROSS')
       or (v_last.step = 'CROSS' and p_step = 'AUDIT'), false) then
    raise exception 'fail_order: % cannot follow %', p_step, v_last.step using errcode = '23514';
  end if;

  v_note := nullif(trim(coalesce(p_payload ->> 'note', '')), '');
  if v_note is not null and length(v_note) > 2000 then raise exception 'fail_payload: note too long' using errcode = '22023'; end if;
  if p_step not in ('DIAGNOSIS', 'EXTRACT', 'CONSOLIDATE', 'INTERVENTION', 'CONTROLLED_TEST', 'VERIFICATION', 'AUDIT') and p_ref is not null then
    raise exception 'fail_ref: % takes no reference', p_step using errcode = '22023';
  end if;

  if p_step = 'DIAGNOSIS' then
    -- first diagnosis: of the failed run, made after the previous step;
    -- again after ODŚWIEŻENIE: of the consolidated base state (28)
    select id, run_id, status, cause_category, gates_version, snapshot_id, created_at into r from public.diagnoses where id = p_ref;
    if r.id is null or r.run_id <> c.run_id or r.created_at < v_last.created_at
       or (v_last.step = 'STATE_REFRESH' and r.snapshot_id is distinct from (select ref_id from private.fail_latest(p_case, 'CONSOLIDATE'))) then
      raise exception 'fail_ref: a diagnosis of the failed run (after ODŚWIEŻENIE: of the base state from 28), made after the previous step' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('status', r.status, 'cause_category', r.cause_category, 'gates_version', r.gates_version, 'snapshot_id', r.snapshot_id);

  elsif p_step = 'EXTRACT' then
    -- 3: separate correct from erroneous; nothing is repaired yet
    select id, run_id, verdict, ruleset_version, created_at into r from public.quality_assessments where id = p_ref;
    if r.id is null or r.run_id <> c.run_id or r.created_at < v_last.created_at then
      raise exception 'fail_ref: a data-quality assessment of the failed run, made after the previous step' using errcode = '23514';
    end if;
    select payload -> 'items' into v_rows from public.fail_case_steps where case_id = p_case and step = 'DECOMPOSITION';
    v_payload := jsonb_build_object(
      'quality_assessment_id', r.id, 'verdict', r.verdict, 'ruleset_version', r.ruleset_version,
      'data_correct', coalesce((select jsonb_agg(jsonb_build_object('signal', q.signal, 'valid_samples', q.valid_samples) order by q.signal)
                                from public.quality_signal_results q where q.assessment_id = r.id and q.valid_samples > 0), '[]'::jsonb),
      'data_erroneous', coalesce((select jsonb_agg(jsonb_build_object('signal', q.signal, 'verdict', q.verdict,
                                    'quarantined_samples', q.quarantined_samples, 'reasons', to_jsonb(q.reasons)) order by q.signal)
                                  from public.quality_signal_results q where q.assessment_id = r.id and (q.quarantined_samples > 0 or q.verdict <> 'VALID')), '[]'::jsonb),
      'product_correct', coalesce((select jsonb_agg(x ->> 'parameter' order by x ->> 'parameter') from jsonb_array_elements(v_rows) x where x ->> 'state' = 'VERIFIED_PASS'), '[]'::jsonb),
      'product_erroneous', coalesce((select jsonb_agg(x ->> 'parameter' order by x ->> 'parameter') from jsonb_array_elements(v_rows) x where x ->> 'state' <> 'VERIFIED_PASS'), '[]'::jsonb));

  elsif p_step = 'PURGE' then
    -- 6: exclude what 3 marked as erroneous. Raw evidence is never deleted (append-only);
    -- the exclusion is recorded so the next state is built without it.
    select * into v_x from private.fail_latest(p_case, 'EXTRACT');
    v_payload := jsonb_build_object(
      'excluded_samples', (select count(*) from public.quality_quarantined_metrics q where q.assessment_id = v_x.ref_id),
      'excluded_signals', coalesce((select jsonb_agg(e ->> 'signal') from jsonb_array_elements(v_x.payload -> 'data_erroneous') e
                                    where e ->> 'verdict' = 'INSUFFICIENT_DATA'), '[]'::jsonb),
      'failed_items', v_x.payload -> 'product_erroneous',
      'rejected_plan_id', (select process_plan_id from public.runs where id = c.run_id),
      'raw_data', 'unchanged (append-only); excluded by reference');

  elsif p_step = 'CONSOLIDATE' then
    -- 28: the kept parts as one stable base state = a snapshot built from 3's assessment (clean samples only)
    select * into v_x from private.fail_latest(p_case, 'EXTRACT');
    select id, sha256, quality_assessment_id, snapshot into r from public.state_snapshots where id = p_ref;
    if r.id is null or r.quality_assessment_id is distinct from v_x.ref_id then
      raise exception 'fail_ref: a state snapshot built from the assessment of step 3' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('snapshot_id', r.id, 'sha256', r.sha256,
      'clean_samples', r.snapshot #> '{totals,cleanSamples}', 'kept_product_items', v_x.payload -> 'product_correct');

  elsif p_step = 'STATE_REFRESH' then
    -- the consolidated state becomes the current base; refused if a newer state exists
    select * into v_x from private.fail_latest(p_case, 'CONSOLIDATE');
    if exists (select 1 from public.state_snapshots s, public.state_snapshots b
               where b.id = v_x.ref_id and s.run_id = c.run_id and s.created_at > b.created_at) then
      raise exception 'fail_ref: a newer state exists; consolidate again' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('base_snapshot_id', v_x.ref_id, 'sha256', v_x.payload -> 'sha256');

  elsif p_step = 'INTERVENTION' then
    select m.id into v_machine from public.runs rr join public.machines m on m.id = rr.machine_id where rr.id = c.run_id;
    select id, machine_id, created_at into r from public.process_plans where id = p_ref;
    if r.id is null or r.machine_id <> v_machine or r.created_at < c.created_at
       or r.id is not distinct from (select process_plan_id from public.runs where id = c.run_id) then
      raise exception 'fail_ref: a new plan for the same machine, created after the case opened' using errcode = '23514';
    end if;
    if private.json_kind(p_payload -> 'changes') <> 'array' or jsonb_array_length(p_payload -> 'changes') = 0
       or exists (select 1 from jsonb_array_elements(p_payload -> 'changes') x
                  where private.json_kind(x -> 'parameter') <> 'string' or length(x ->> 'parameter') not between 1 and 64
                     or private.json_kind(x -> 'from') not in ('number', 'string') or private.json_kind(x -> 'to') not in ('number', 'string'))
       or v_note is null then
      raise exception 'fail_payload: intervention needs changes [{parameter, from, to}] and a rationale note' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('plan_id', r.id, 'cause_category', v_diag.payload -> 'cause_category',
      'changes', (select jsonb_agg(jsonb_build_object('parameter', x ->> 'parameter', 'from', x -> 'from',
                   'to', x -> 'to', 'unit', x ->> 'unit')) from jsonb_array_elements(p_payload -> 'changes') x));

  elsif p_step = 'CONTROLLED_TEST' then
    select id, status, process_plan_id into r from public.runs where id = p_ref;
    if r.id is null or r.status <> 'COMPLETED' or r.process_plan_id is distinct from (select ref_id from private.fail_latest(p_case, 'INTERVENTION')) then
      raise exception 'fail_ref: a completed run on the intervention plan' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('run_id', r.id, 'run_status', r.status);

  elsif p_step = 'VERIFICATION' then
    select id, run_id, state, evidence_saved, kind, details into r from public.verifications where id = p_ref;
    if r.id is null or r.run_id is distinct from (select ref_id from private.fail_latest(p_case, 'CONTROLLED_TEST')) then
      raise exception 'fail_ref: a verification of the controlled test run' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('state', r.state, 'kind', r.kind, 'evidence_saved', r.evidence_saved, 'rows', r.details -> 'rows');
    update public.fail_cases set outcome = r.state, outcome_evidence_saved = (r.state = 'VERIFIED_PASS' and r.evidence_saved)
    where id = p_case;
    c.outcome := r.state; c.outcome_evidence_saved := (r.state = 'VERIFIED_PASS' and r.evidence_saved);

  elsif p_step = 'REPORT' then
    v_payload := jsonb_build_object('outcome', c.outcome, 'evidence_saved', c.outcome_evidence_saved,
      'diagnoses', (select count(*) from public.fail_case_steps s where s.case_id = p_case and s.step = 'DIAGNOSIS'),
      'cycles', (select count(*) from public.fail_case_steps s where s.case_id = p_case and s.step = 'EXTRACT'),
      'intervention', (select payload -> 'changes' from private.fail_latest(p_case, 'INTERVENTION')),
      'next', case when c.outcome = 'VERIFIED_PASS' and c.outcome_evidence_saved then 'FILTER'
                   else 'closed: not a verified PASS, never knowledge' end);
    v_close := not (c.outcome = 'VERIFIED_PASS' and c.outcome_evidence_saved);

  elsif p_step = 'FILTER' then
    -- 38: only what was erroneous in 3 and is now verified PASS passes, with the change that did it
    select * into v_x from private.fail_latest(p_case, 'EXTRACT');
    v_rows := coalesce((select jsonb_agg(x order by x ->> 'parameter')
                        from jsonb_array_elements((select payload -> 'rows' from private.fail_latest(p_case, 'VERIFICATION'))) x
                        where x ->> 'state' = 'VERIFIED_PASS'
                          and (v_x.payload -> 'product_erroneous') ? (x ->> 'parameter')), '[]'::jsonb);
    if jsonb_array_length(v_rows) = 0 then
      raise exception 'fail_filter: nothing passes 38 (no failed item is now a verified PASS)' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('passed', v_rows,
      'intervention', (select payload from private.fail_latest(p_case, 'INTERVENTION')),
      'verification_id', (select ref_id from private.fail_latest(p_case, 'VERIFICATION')));

  elsif p_step = 'VERIFY_PERSIST' then
    -- 39: check again (measurements may have been added since), then persist as knowledge
    select * into v_x from private.fail_latest(p_case, 'VERIFICATION');
    select id, state, evidence_saved, kind into r from public.verifications where id = v_x.ref_id;
    if r.state <> 'VERIFIED_PASS' or not r.evidence_saved then
      raise exception 'fail_verify: the verification is no longer a PASS with evidence' using errcode = '23514';
    end if;
    if r.kind = 'PRODUCT' then
      v_check := private.product_check((select ref_id from private.fail_latest(p_case, 'CONTROLLED_TEST')));
      if v_check ->> 'state' <> 'VERIFIED_PASS' then
        raise exception 'fail_verify: the product check on current measurements is %', v_check ->> 'state' using errcode = '23514';
      end if;
    end if;
    insert into public.knowledge_entries (organization_id, case_id, content)
    values (c.organization_id, p_case, (select payload from private.fail_latest(p_case, 'FILTER')))
    returning id into v_id;
    v_payload := jsonb_build_object('knowledge_id', v_id, 'rechecked_state', coalesce(v_check ->> 'state', r.state::text));

  elsif p_step = 'LOCK' then
    -- 40: threshold = verified PASS with evidence, re-checked by 39 (no numeric threshold). Lock read-only.
    update public.fail_cases set locked_at = now() where id = p_case;
    v_payload := jsonb_build_object('threshold', 'verified PASS with saved evidence, re-checked at 39',
      'locked_plan_id', (select ref_id from private.fail_latest(p_case, 'INTERVENTION')),
      'knowledge_id', (select id from public.knowledge_entries where case_id = p_case));

  elsif p_step = 'CROSS' then
    v_payload := jsonb_build_object('new_baseline_plan_id', (select ref_id from private.fail_latest(p_case, 'INTERVENTION')));

  elsif p_step = 'AUDIT' then
    -- a seal of the controlled test run made after CROSS that contains this case
    select id, run_id, created_at, snapshot into r from public.audit_records where id = p_ref;
    if r.id is null or r.run_id is distinct from (select ref_id from private.fail_latest(p_case, 'CONTROLLED_TEST'))
       or r.created_at < v_last.created_at
       or not exists (select 1 from jsonb_array_elements(r.snapshot -> 'fail_cases') f
                      where f ->> 'id' = p_case::text and f -> 'steps' @> '[{"step":"CROSS"}]') then
      raise exception 'fail_ref: a seal of the controlled test run made after CROSS that contains this case' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('audit_record_id', r.id);
    v_close := true;
  end if;

  if v_note is not null then v_payload := v_payload || jsonb_build_object('note', v_note); end if;
  insert into public.fail_case_steps (organization_id, case_id, seq, step, ref_id, payload)
  values (c.organization_id, p_case, v_last.seq + 1, p_step, p_ref, v_payload) returning id into v_id;
  if v_close then update public.fail_cases set status = 'CLOSED', closed_at = now() where id = p_case; end if;
  return v_id;
end;
$$;
