-- 0018: FAIL loop (spec extension), v0.
--
--   VERIFIED_FAIL -> ROZPAD I (DECOMPOSITION) -> 3 SEPARATION -> 6 QUARANTINE
--   -> 28 CONSOLIDATION -> STATE_REFRESH -> DIAGNOSIS -> INTERVENTION
--   -> CONTROLLED_TEST -> VERIFICATION (PASS / FAIL / INCONCLUSIVE / INCOMPLETE)
--   Only a VERIFIED_PASS with saved evidence may enter knowledge 38 -> 39 -> 40 -> CROSS.
--
-- The step names come from the specification; their content here is a v0
-- interpretation (docs/FAIL_LOOP.md): each step is an append-only record that
-- points at real evidence (quality assessment, state snapshot, diagnosis, plan,
-- run, verification). The database enforces the order and the references.
-- A failed or unresolved attempt stays recorded and never becomes knowledge.
--
-- Also:
--   * record_product_verification: the product check against targets, computed
--     in the database from stored measurements (same rules as
--     lib/verification/checks.ts productCheck), so a user cannot forge it.
--   * diagnoses: a named cause (DIAGNOSED) only from a trusted role (engine).
--     Before, a user could insert DIAGNOSED with self-written gates via the API.

-- ---------------------------------------------------------------- verification details
alter table public.verifications add column details jsonb;

create or replace function public.record_product_verification(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_target uuid;
  v_rows jsonb;
  v_state public.verification_state;
  v_id uuid;
begin
  select r.id, r.organization_id, r.status, p.product_target_id into v_run
  from public.runs r left join public.process_plans p on p.id = r.process_plan_id where r.id = p_run;
  if not found then raise exception 'run not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(v_run.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_run.status <> 'COMPLETED' then
    raise exception 'engine_run_not_completed: a run is verified after it is completed' using errcode = '23514';
  end if;
  v_target := v_run.product_target_id;

  with t as (
    select tv.parameter, tv.unit, tv.min_value, tv.max_value
    from public.product_target_values tv where v_target is not null and tv.product_target_id = v_target
  ), m as (
    select pm.parameter, pm.unit, pm.value
    from public.product_measurements pm join public.product_samples ps on ps.id = pm.product_sample_id
    where ps.run_id = p_run
  ), r as (
    select t.parameter, t.unit, t.min_value, t.max_value,
      (select count(*) from m where m.parameter = t.parameter) as n,
      (select bool_or(lower(trim(coalesce(m.unit, ''))) <> lower(trim(coalesce(t.unit, '')))) from m where m.parameter = t.parameter) as unit_mismatch,
      (select coalesce(jsonb_agg(m.value order by m.value), '[]'::jsonb) from m where m.parameter = t.parameter) as all_values,
      (select coalesce(jsonb_agg(m.value order by m.value), '[]'::jsonb) from m where m.parameter = t.parameter
         and ((t.min_value is not null and m.value < t.min_value) or (t.max_value is not null and m.value > t.max_value))) as outside
    from t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'parameter', parameter, 'unit', unit, 'min', min_value, 'max', max_value,
      'state', case when n = 0 then 'INCOMPLETE' when unit_mismatch then 'INCONCLUSIVE'
                    when min_value is null and max_value is null then 'INCONCLUSIVE'
                    when jsonb_array_length(outside) > 0 then 'VERIFIED_FAIL' else 'VERIFIED_PASS' end,
      'reason', case when n = 0 then 'NOT_MEASURED' when unit_mismatch then 'UNIT_MISMATCH'
                     when min_value is null and max_value is null then 'NO_TOLERANCE'
                     when jsonb_array_length(outside) > 0 then 'OUTSIDE' end,
      'values', case when n > 0 and not unit_mismatch and (min_value is not null or max_value is not null)
                          and jsonb_array_length(outside) > 0 then outside else all_values end)
      order by parameter), '[]'::jsonb)
  into v_rows from r;

  v_state := case
    when jsonb_array_length(v_rows) = 0 then 'INCOMPLETE'
    when exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'state' = 'VERIFIED_FAIL') then 'VERIFIED_FAIL'
    when exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'state' = 'INCOMPLETE') then 'INCOMPLETE'
    when exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'state' = 'INCONCLUSIVE') then 'INCONCLUSIVE'
    else 'VERIFIED_PASS' end;

  insert into public.verifications (organization_id, run_id, kind, state, evidence_saved, verified_at, details)
  values (v_run.organization_id, p_run, 'PRODUCT', v_state, v_state = 'VERIFIED_PASS', now(),
          jsonb_build_object('source', 'app_product_check_v1', 'product_target_id', v_target,
                             'reason', case when jsonb_array_length(v_rows) = 0 then 'NO_TARGETS' end, 'rows', v_rows))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- named cause only from a trusted role
create or replace function private.tg_diagnosis_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare v_verdict public.quality_verdict;
begin
  if new.status = 'DIAGNOSED' then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'diagnosis refused: a named cause comes only from the engine' using errcode = '42501';
    end if;
    if exists (select 1 from jsonb_array_elements(new.gates) g where g ->> 'status' is distinct from 'PASS') then
      raise exception 'diagnosis refused: not every precondition passed' using errcode = '23514';
    end if;
    select qa.verdict into v_verdict
    from public.state_snapshots s
    join public.quality_assessments qa on qa.id = s.quality_assessment_id
    where s.id = new.snapshot_id;
    if v_verdict is null or v_verdict = 'INSUFFICIENT_DATA' then
      raise exception 'diagnosis refused: data quality insufficient' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- tables
create type public.fail_step as enum ('DECOMPOSITION', 'SEPARATION', 'QUARANTINE', 'CONSOLIDATION',
  'STATE_REFRESH', 'DIAGNOSIS', 'INTERVENTION', 'CONTROLLED_TEST', 'VERIFICATION');
create type public.fail_case_status as enum ('OPEN', 'CLOSED');
create type public.knowledge_stage as enum ('S38', 'S39', 'S40', 'CROSS');

create table public.fail_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  trigger_verification_id uuid not null unique references public.verifications(id),
  status public.fail_case_status not null default 'OPEN',
  outcome public.verification_state,          -- state of the loop's final verification
  outcome_evidence_saved boolean not null default false,
  closed_note text check (closed_note is null or length(closed_note) <= 2000),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (id, organization_id),
  foreign key (run_id, organization_id) references public.runs(id, organization_id),
  check ((status = 'OPEN') = (closed_at is null))
);
create index fail_cases_org_idx on public.fail_cases (organization_id, created_at desc);

create table public.fail_case_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  seq integer not null,
  step public.fail_step not null,
  ref_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (case_id, seq),
  foreign key (case_id, organization_id) references public.fail_cases(id, organization_id) on delete cascade
);
create index fail_case_steps_case_idx on public.fail_case_steps (case_id, seq);

create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  stage public.knowledge_stage not null,
  statement text not null check (length(trim(statement)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (case_id, stage),
  foreign key (case_id, organization_id) references public.fail_cases(id, organization_id) on delete cascade
);

create trigger touch before insert or update on public.fail_cases for each row execute function private.tg_touch();
create trigger touch before insert or update on public.fail_case_steps for each row execute function private.tg_touch();
create trigger touch before insert or update on public.knowledge_entries for each row execute function private.tg_touch();

-- steps and knowledge are append-only for everyone
create or replace function private.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'append_only: % records cannot be changed or deleted', tg_table_name using errcode = '23514'; end $$;
create trigger append_only before update or delete on public.fail_case_steps for each row execute function private.tg_append_only();
create trigger append_only before update or delete on public.knowledge_entries for each row execute function private.tg_append_only();

-- knowledge only from a loop that ended in a verified PASS with saved evidence, in stage order
create or replace function private.tg_knowledge_guard() returns trigger
language plpgsql set search_path = '' as $$
declare c record; v_prev public.knowledge_stage;
begin
  select status, outcome, outcome_evidence_saved into c from public.fail_cases where id = new.case_id;
  if c.status is distinct from 'CLOSED' or c.outcome is distinct from 'VERIFIED_PASS' or not c.outcome_evidence_saved then
    raise exception 'knowledge_refused: only a loop closed with a verified PASS and saved evidence becomes knowledge' using errcode = '23514';
  end if;
  v_prev := case new.stage when 'S39' then 'S38' when 'S40' then 'S39' when 'CROSS' then 'S40' end;
  if v_prev is not null and not exists (select 1 from public.knowledge_entries k where k.case_id = new.case_id and k.stage = v_prev) then
    raise exception 'knowledge_order: % needs % first', new.stage, v_prev using errcode = '23514';
  end if;
  return new;
end $$;
create trigger knowledge_guard before insert on public.knowledge_entries for each row execute function private.tg_knowledge_guard();

alter table public.fail_cases enable row level security;
alter table public.fail_case_steps enable row level security;
alter table public.knowledge_entries enable row level security;
create policy sel on public.fail_cases for select using (private.is_org_member(organization_id));
create policy sel on public.fail_case_steps for select using (private.is_org_member(organization_id));
create policy sel on public.knowledge_entries for select using (private.is_org_member(organization_id));
revoke all on public.fail_cases, public.fail_case_steps, public.knowledge_entries from anon;
revoke insert, update, delete, truncate on public.fail_cases, public.fail_case_steps, public.knowledge_entries from authenticated;

-- ---------------------------------------------------------------- functions
create or replace function private.fail_last_step(p_case uuid)
returns table (seq integer, step public.fail_step, ref_id uuid, payload jsonb)
language sql stable set search_path = '' as $$
  select s.seq, s.step, s.ref_id, s.payload from public.fail_case_steps s where s.case_id = p_case order by s.seq desc limit 1;
$$;

create or replace function private.fail_latest_ref(p_case uuid, p_step public.fail_step)
returns uuid language sql stable set search_path = '' as $$
  select s.ref_id from public.fail_case_steps s where s.case_id = p_case and s.step = p_step order by s.seq desc limit 1;
$$;

create or replace function private.last_created(p_case uuid)
returns timestamptz language sql stable set search_path = '' as $$
  select max(created_at) from public.fail_case_steps where case_id = p_case;
$$;

create or replace function public.open_fail_case(p_verification uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v record; v_case uuid; v_items jsonb;
begin
  select id, organization_id, run_id, kind, state, details into v from public.verifications where id = p_verification;
  if not found then raise exception 'verification not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(v.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v.state <> 'VERIFIED_FAIL' then
    raise exception 'fail_not_failed: the loop starts only from a VERIFIED_FAIL' using errcode = '23514';
  end if;
  insert into public.fail_cases (organization_id, run_id, trigger_verification_id)
  values (v.organization_id, v.run_id, v.id) returning id into v_case;
  -- ROZPAD I: the failure decomposed into the items that did not pass (stored details only)
  v_items := coalesce((select jsonb_agg(jsonb_build_object('parameter', x ->> 'parameter', 'state', x ->> 'state',
                         'reason', x ->> 'reason', 'unit', x ->> 'unit', 'values', x -> 'values') order by x ->> 'parameter')
                       from jsonb_array_elements(coalesce(v.details -> 'rows', '[]'::jsonb)) x
                       where x ->> 'state' <> 'VERIFIED_PASS'), '[]'::jsonb);
  insert into public.fail_case_steps (organization_id, case_id, seq, step, ref_id, payload)
  values (v.organization_id, v_case, 1, 'DECOMPOSITION', v.id,
          jsonb_build_object('verification_kind', v.kind, 'items', v_items,
            'note', case when jsonb_array_length(v_items) = 0 then 'the failing verification has no item details' end));
  return v_case;
end;
$$;

create or replace function public.record_fail_step(p_case uuid, p_step public.fail_step, p_ref uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record; v_last record; v_id uuid; v_payload jsonb := '{}'::jsonb; v_note text;
  v_items text[]; v_scope text[]; r record; v_machine uuid; v_state public.verification_state; v_ev boolean;
begin
  select * into c from public.fail_cases where id = p_case for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(c.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'OPEN' then raise exception 'fail_closed: the case is closed' using errcode = '23514'; end if;
  select * into v_last from private.fail_last_step(p_case);

  -- allowed transitions; a diagnosis without a named cause loops back to quarantine with new data
  -- coalesce: a NULL (e.g. a diagnosis without status) must refuse, not pass
  if not coalesce((v_last.step = 'DECOMPOSITION' and p_step = 'SEPARATION')
       or (v_last.step = 'SEPARATION' and p_step = 'QUARANTINE')
       or (v_last.step = 'QUARANTINE' and p_step = 'CONSOLIDATION')
       or (v_last.step = 'CONSOLIDATION' and p_step = 'STATE_REFRESH')
       or (v_last.step = 'STATE_REFRESH' and p_step = 'DIAGNOSIS')
       or (v_last.step = 'DIAGNOSIS' and v_last.payload ->> 'status' = 'DIAGNOSED' and p_step = 'INTERVENTION')
       or (v_last.step = 'DIAGNOSIS' and v_last.payload ->> 'status' <> 'DIAGNOSED' and p_step = 'QUARANTINE')
       or (v_last.step = 'INTERVENTION' and p_step = 'CONTROLLED_TEST')
       or (v_last.step = 'CONTROLLED_TEST' and p_step = 'VERIFICATION'), false) then
    raise exception 'fail_order: % cannot follow %', p_step, v_last.step using errcode = '23514';
  end if;

  v_note := nullif(trim(coalesce(p_payload ->> 'note', '')), '');
  if v_note is not null and length(v_note) > 2000 then raise exception 'fail_payload: note too long' using errcode = '22023'; end if;

  if p_step = 'SEPARATION' then
    select array_agg(x ->> 'parameter') into v_items
    from public.fail_case_steps s, jsonb_array_elements(s.payload -> 'items') x where s.case_id = p_case and s.step = 'DECOMPOSITION';
    if private.json_kind(p_payload -> 'in_scope') <> 'array' then raise exception 'fail_payload: in_scope must be a list' using errcode = '22023'; end if;
    select array_agg(distinct x) into v_scope from jsonb_array_elements_text(p_payload -> 'in_scope') x;
    if v_scope is null or not (v_scope <@ coalesce(v_items, '{}')) then
      raise exception 'fail_payload: in_scope must name failed items from ROZPAD I' using errcode = '22023';
    end if;
    v_payload := jsonb_build_object('in_scope', to_jsonb(v_scope),
      'out_of_scope', to_jsonb(coalesce((select array_agg(i) from unnest(v_items) i where not (i = any(v_scope))), '{}')));

  elsif p_step = 'QUARANTINE' then
    select id, run_id, verdict, ruleset_version, created_at into r from public.quality_assessments where id = p_ref;
    if r.id is null or r.run_id <> c.run_id or r.created_at < private.last_created(p_case) then
      raise exception 'fail_ref: a quality assessment of the failed run, made after the previous step' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('verdict', r.verdict, 'ruleset_version', r.ruleset_version,
      'quarantined', (select count(*) from public.quality_quarantined_metrics q where q.assessment_id = r.id));

  elsif p_step = 'CONSOLIDATION' then
    if p_ref is not null then raise exception 'fail_ref: consolidation takes no reference' using errcode = '22023'; end if;
    v_payload := jsonb_build_object(
      'trigger_verification_id', c.trigger_verification_id,
      'quality_assessment_id', private.fail_latest_ref(p_case, 'QUARANTINE'),
      'in_scope', (select s.payload -> 'in_scope' from public.fail_case_steps s where s.case_id = p_case and s.step = 'SEPARATION' order by s.seq desc limit 1),
      'measurements', (select count(*) from public.product_measurements pm join public.product_samples ps on ps.id = pm.product_sample_id where ps.run_id = c.run_id),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('filename', f.filename, 'sha256', f.sha256) order by f.created_at), '[]'::jsonb)
                from public.run_files f where f.run_id = c.run_id));

  elsif p_step = 'STATE_REFRESH' then
    select id, sha256, quality_assessment_id into r from public.state_snapshots where id = p_ref;
    if r.id is null or r.quality_assessment_id is distinct from private.fail_latest_ref(p_case, 'QUARANTINE') then
      raise exception 'fail_ref: a state snapshot built from the quarantine step''s assessment' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('sha256', r.sha256);

  elsif p_step = 'DIAGNOSIS' then
    select id, status, cause_category, gates_version, snapshot_id into r from public.diagnoses where id = p_ref;
    if r.id is null or r.snapshot_id is distinct from private.fail_latest_ref(p_case, 'STATE_REFRESH') then
      raise exception 'fail_ref: a diagnosis of the refreshed state' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('status', r.status, 'cause_category', r.cause_category, 'gates_version', r.gates_version);

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
    v_payload := jsonb_build_object('changes', (select jsonb_agg(jsonb_build_object('parameter', x ->> 'parameter', 'from', x -> 'from',
                   'to', x -> 'to', 'unit', x ->> 'unit')) from jsonb_array_elements(p_payload -> 'changes') x));

  elsif p_step = 'CONTROLLED_TEST' then
    select id, status, process_plan_id into r from public.runs where id = p_ref;
    if r.id is null or r.status <> 'COMPLETED' or r.process_plan_id is distinct from private.fail_latest_ref(p_case, 'INTERVENTION') then
      raise exception 'fail_ref: a completed run on the intervention plan' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('run_status', r.status);

  elsif p_step = 'VERIFICATION' then
    select id, run_id, state, evidence_saved, kind into r from public.verifications where id = p_ref;
    if r.id is null or r.run_id is distinct from private.fail_latest_ref(p_case, 'CONTROLLED_TEST') then
      raise exception 'fail_ref: a verification of the controlled test run' using errcode = '23514';
    end if;
    v_payload := jsonb_build_object('state', r.state, 'kind', r.kind, 'evidence_saved', r.evidence_saved);
    v_state := r.state; v_ev := r.evidence_saved;
  end if;

  if v_note is not null then v_payload := v_payload || jsonb_build_object('note', v_note); end if;
  insert into public.fail_case_steps (organization_id, case_id, seq, step, ref_id, payload)
  values (c.organization_id, p_case, v_last.seq + 1, p_step, p_ref, v_payload) returning id into v_id;

  if p_step = 'VERIFICATION' then
    update public.fail_cases set status = 'CLOSED', outcome = v_state,
      outcome_evidence_saved = (v_state = 'VERIFIED_PASS' and v_ev), closed_at = now()
    where id = p_case;
  end if;
  return v_id;
end;
$$;

-- An attempt can be closed without a verification (kept, never knowledge).
create or replace function public.close_fail_case(p_case uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c record;
begin
  select id, organization_id, status into c from public.fail_cases where id = p_case for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(c.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'OPEN' then raise exception 'fail_closed: the case is closed' using errcode = '23514'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null or length(p_note) > 2000 then
    raise exception 'fail_payload: closing needs a reason' using errcode = '22023';
  end if;
  update public.fail_cases set status = 'CLOSED', outcome = null, outcome_evidence_saved = false,
    closed_note = trim(p_note), closed_at = now() where id = p_case;
end;
$$;

create or replace function public.add_knowledge(p_case uuid, p_stage public.knowledge_stage, p_statement text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c record; v_id uuid;
begin
  select id, organization_id into c from public.fail_cases where id = p_case;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(c.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.knowledge_entries (organization_id, case_id, stage, statement)
  values (c.organization_id, p_case, p_stage, trim(p_statement)) returning id into v_id;  -- tg_knowledge_guard decides
  return v_id;
end;
$$;

revoke all on function public.record_product_verification(uuid) from public, anon;
revoke all on function public.open_fail_case(uuid) from public, anon;
revoke all on function public.record_fail_step(uuid, public.fail_step, uuid, jsonb) from public, anon;
revoke all on function public.close_fail_case(uuid, text) from public, anon;
revoke all on function public.add_knowledge(uuid, public.knowledge_stage, text) from public, anon;
grant execute on function public.record_product_verification(uuid) to authenticated;
grant execute on function public.open_fail_case(uuid) to authenticated;
grant execute on function public.record_fail_step(uuid, public.fail_step, uuid, jsonb) to authenticated;
grant execute on function public.close_fail_case(uuid, text) to authenticated;
grant execute on function public.add_knowledge(uuid, public.knowledge_stage, text) to authenticated;
