-- 0019: FAIL loop in order A (confirmed 2026-09-26), audit-v3.
--
--   FAIL -> ROZPAD I -> SZCZEGÓŁOWA DIAGNOZA -> 3 EXTRACT -> 6 PURGE -> 28 CONSOLIDATE
--   -> ODŚWIEŻENIE -> NAPRAWA -> CONTROLLED TEST -> WERYFIKACJA -> RAPORT
--   -> 38 FILTR -> 39 VERIFY + PERSIST -> 40 THRESHOLD / LOCK / READ_ONLY -> CROSS -> AUDIT
--
-- Meanings (docs/FAIL_LOOP.md): 3 separates correct from erroneous without repairing;
-- 6 excludes what 3 marked erroneous (a recorded filter; raw evidence stays append-only);
-- 28 builds one stable base state from the kept parts; 38 filters what passes;
-- 39 re-checks and persists; 40 is the threshold (verified PASS with evidence, no
-- numeric threshold) that locks the case read-only; CROSS starts a new cycle.
-- Rule kept from 0018: no repair without a named cause (DIAGNOSED, engine only). After
-- ODŚWIEŻENIE without one, the loop diagnoses again on the consolidated state.
-- Replaces the 0018 loop (its tables were empty); keeps record_product_verification,
-- now through private.product_check (also used by 39 to re-check).

create or replace function private.product_check(p_run uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target uuid;
  v_rows jsonb;
  v_state public.verification_state;
begin
  select p.product_target_id into v_target
  from public.runs r left join public.process_plans p on p.id = r.process_plan_id where r.id = p_run;
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

  return jsonb_build_object('state', v_state, 'product_target_id', v_target,
    'reason', case when jsonb_array_length(v_rows) = 0 then 'NO_TARGETS' end, 'rows', v_rows);
end;
$$;
revoke all on function private.product_check(uuid) from public, anon, authenticated;

create or replace function public.record_product_verification(p_run uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_check jsonb;
  v_id uuid;
begin
  select r.id, r.organization_id, r.status into v_run from public.runs r where r.id = p_run;
  if not found then raise exception 'run not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(v_run.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_run.status <> 'COMPLETED' then
    raise exception 'engine_run_not_completed: a run is verified after it is completed' using errcode = '23514';
  end if;
  v_check := private.product_check(p_run);
  insert into public.verifications (organization_id, run_id, kind, state, evidence_saved, verified_at, details)
  values (v_run.organization_id, p_run, 'PRODUCT', (v_check ->> 'state')::public.verification_state,
          v_check ->> 'state' = 'VERIFIED_PASS', now(),
          jsonb_build_object('source', 'app_product_check_v1', 'product_target_id', v_check -> 'product_target_id',
                             'reason', v_check -> 'reason', 'rows', v_check -> 'rows'))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- rebuild the loop tables (empty on production)
do $$ begin
  if exists (select 1 from public.fail_cases) or exists (select 1 from public.knowledge_entries) then
    raise exception 'FAIL loop tables are not empty; this rebuild needs a data migration';
  end if;
end $$;
drop function if exists public.record_fail_step(uuid, public.fail_step, uuid, jsonb);
drop function if exists public.add_knowledge(uuid, public.knowledge_stage, text);
drop function if exists public.close_fail_case(uuid, text);
drop function if exists public.open_fail_case(uuid);
drop function if exists private.fail_last_step(uuid);
drop function if exists private.fail_latest_ref(uuid, public.fail_step);
drop function if exists private.last_created(uuid);
drop table public.knowledge_entries;
drop table public.fail_case_steps;
drop table public.fail_cases;
drop function if exists private.tg_knowledge_guard();
drop type public.fail_step;
drop type public.knowledge_stage;

-- Order A. Codes from the specification in comments.
create type public.fail_step as enum (
  'DECOMPOSITION',     -- ROZPAD I
  'DIAGNOSIS',         -- SZCZEGÓŁOWA DIAGNOZA
  'EXTRACT',           -- 3  EXTRACT / SEPARACJA: correct vs erroneous, nothing repaired yet
  'PURGE',             -- 6  PURGE / CZYSZCZENIE: exclude what 3 marked as erroneous (filter, never delete)
  'CONSOLIDATE',       -- 28 CONSOLIDATE: the kept parts as one stable base state
  'STATE_REFRESH',     -- ODŚWIEŻENIE STANU
  'INTERVENTION',      -- NAPRAWA
  'CONTROLLED_TEST',   -- CONTROLLED TEST
  'VERIFICATION',      -- WERYFIKACJA
  'REPORT',            -- RAPORT
  'FILTER',            -- 38 FILTR
  'VERIFY_PERSIST',    -- 39 VERIFY + PERSIST
  'LOCK',              -- 40 THRESHOLD / LOCK / READ_ONLY
  'CROSS',             -- CROSS: a new cycle starts from the locked state
  'AUDIT');            -- AUDIT

create table public.fail_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  trigger_verification_id uuid not null unique references public.verifications(id),
  status public.fail_case_status not null default 'OPEN',
  outcome public.verification_state,
  outcome_evidence_saved boolean not null default false,
  locked_at timestamptz,
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

-- Knowledge = what passed 38 FILTR, persisted by 39 (one record per case, never changed).
create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null unique,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  foreign key (case_id, organization_id) references public.fail_cases(id, organization_id) on delete cascade
);

create trigger touch before insert or update on public.fail_cases for each row execute function private.tg_touch();
create trigger touch before insert or update on public.fail_case_steps for each row execute function private.tg_touch();
create trigger touch before insert or update on public.knowledge_entries for each row execute function private.tg_touch();
create trigger append_only before update or delete on public.fail_case_steps for each row execute function private.tg_append_only();
create trigger append_only before update or delete on public.knowledge_entries for each row execute function private.tg_append_only();

-- knowledge only from a verified PASS with saved evidence that went through 38 FILTR
create or replace function private.tg_knowledge_guard() returns trigger
language plpgsql set search_path = '' as $$
declare c record;
begin
  select outcome, outcome_evidence_saved into c from public.fail_cases where id = new.case_id;
  if c.outcome is distinct from 'VERIFIED_PASS' or not coalesce(c.outcome_evidence_saved, false)
     or not exists (select 1 from public.fail_case_steps s where s.case_id = new.case_id and s.step = 'FILTER') then
    raise exception 'knowledge_refused: only a verified PASS with saved evidence that passed 38 becomes knowledge' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger knowledge_guard before insert on public.knowledge_entries for each row execute function private.tg_knowledge_guard();

-- 40 LOCK: a locked case is read-only; only CROSS and AUDIT may follow
create or replace function private.tg_fail_case_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.locked_at is not null and (new.locked_at, new.outcome, new.outcome_evidence_saved, new.run_id, new.trigger_verification_id)
     is distinct from (old.locked_at, old.outcome, old.outcome_evidence_saved, old.run_id, old.trigger_verification_id) then
    raise exception 'fail_locked: the case passed 40 and is read-only' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then raise exception 'append_only: fail cases cannot be deleted' using errcode = '23514'; end if;
  return new;
end $$;
create trigger fail_case_lock before update or delete on public.fail_cases for each row execute function private.tg_fail_case_lock();

alter table public.fail_cases enable row level security;
alter table public.fail_case_steps enable row level security;
alter table public.knowledge_entries enable row level security;
create policy sel on public.fail_cases for select using (private.is_org_member(organization_id));
create policy sel on public.fail_case_steps for select using (private.is_org_member(organization_id));
create policy sel on public.knowledge_entries for select using (private.is_org_member(organization_id));
revoke all on public.fail_cases, public.fail_case_steps, public.knowledge_entries from anon;
revoke insert, update, delete, truncate on public.fail_cases, public.fail_case_steps, public.knowledge_entries from authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function private.fail_last_step(p_case uuid)
returns table (seq integer, step public.fail_step, ref_id uuid, payload jsonb, created_at timestamptz)
language sql stable set search_path = '' as $$
  select s.seq, s.step, s.ref_id, s.payload, s.created_at from public.fail_case_steps s where s.case_id = p_case order by s.seq desc limit 1;
$$;
create or replace function private.fail_latest(p_case uuid, p_step public.fail_step)
returns table (ref_id uuid, payload jsonb, created_at timestamptz)
language sql stable set search_path = '' as $$
  select s.ref_id, s.payload, s.created_at from public.fail_case_steps s where s.case_id = p_case and s.step = p_step order by s.seq desc limit 1;
$$;

-- ---------------------------------------------------------------- open
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
  -- ROZPAD I: every item of the failing verification, failed or not (stored details only)
  v_items := coalesce((select jsonb_agg(jsonb_build_object('parameter', x ->> 'parameter', 'state', x ->> 'state',
                         'reason', x ->> 'reason', 'unit', x ->> 'unit', 'min', x -> 'min', 'max', x -> 'max', 'values', x -> 'values')
                         order by x ->> 'parameter')
                       from jsonb_array_elements(coalesce(v.details -> 'rows', '[]'::jsonb)) x), '[]'::jsonb);
  insert into public.fail_case_steps (organization_id, case_id, seq, step, ref_id, payload)
  values (v.organization_id, v_case, 1, 'DECOMPOSITION', v.id,
          jsonb_build_object('verification_kind', v.kind, 'items', v_items,
            'note', case when jsonb_array_length(v_items) = 0 then 'the failing verification has no item details' end));
  return v_case;
end;
$$;

-- ---------------------------------------------------------------- record a step
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
    v_payload := jsonb_build_object('knowledge_id', v_id, 'rechecked_state', coalesce(v_check ->> 'state', r.state));

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

-- An attempt can be closed before VERIFICATION with a reason (kept, never knowledge).
create or replace function public.close_fail_case(p_case uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c record;
begin
  select id, organization_id, status, outcome into c from public.fail_cases where id = p_case for update;
  if not found then raise exception 'case not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(c.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'OPEN' then raise exception 'fail_closed: the case is closed' using errcode = '23514'; end if;
  if c.outcome is not null then raise exception 'fail_order: after VERIFICATION the case ends with RAPORT' using errcode = '23514'; end if;
  if nullif(trim(coalesce(p_note, '')), '') is null or length(p_note) > 2000 then
    raise exception 'fail_payload: closing needs a reason' using errcode = '22023';
  end if;
  update public.fail_cases set status = 'CLOSED', closed_note = trim(p_note), closed_at = now() where id = p_case;
end;
$$;

revoke all on function public.open_fail_case(uuid) from public, anon;
revoke all on function public.record_fail_step(uuid, public.fail_step, uuid, jsonb) from public, anon;
revoke all on function public.close_fail_case(uuid, text) from public, anon;
grant execute on function public.open_fail_case(uuid) to authenticated;
grant execute on function public.record_fail_step(uuid, public.fail_step, uuid, jsonb) to authenticated;
grant execute on function public.close_fail_case(uuid, text) to authenticated;

-- ---------------------------------------------------------------- audit-v3: the seal includes FAIL-loop cases
create or replace function public.seal_run_audit(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_plan uuid;
  v_machine uuid;
  v_prev text;
  v_seq integer;
  v_snap jsonb;
  v_id uuid;
begin
  select organization_id, process_plan_id, machine_id into v_org, v_plan, v_machine from public.runs where id = p_run_id;
  if v_org is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if not private.has_org_role(v_org, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- one writer per organization at a time keeps the sequence gap-free
  perform pg_advisory_xact_lock(hashtextextended('audit:' || v_org::text, 0));
  select a.final_hash, (a.snapshot ->> 'seq')::integer into v_prev, v_seq
  from public.audit_records a
  where a.organization_id = v_org
  order by (a.snapshot ->> 'seq')::integer desc
  limit 1;

  v_snap := jsonb_build_object(
    'schema', 'audit-v3',
    'seq', coalesce(v_seq, 0) + 1,
    'previous_hash', v_prev,
    'sealed_at', now(),
    'sealed_by', (select auth.uid()),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name)
      from public.organizations o where o.id = v_org),
    'site', (select jsonb_build_object('id', s.id, 'name', s.name)
      from public.machines mm join public.sites s on s.id = mm.site_id where mm.id = v_machine),
    'machine', (select jsonb_build_object(
        'id', mm.id, 'manufacturer', mm.manufacturer, 'model', mm.model, 'variant', mm.variant,
        'serial_number', mm.serial_number,
        'configuration', jsonb_build_object(
          'screw_diameter_mm', mm.screw_diameter_mm, 'l_d', mm.l_d, 'drive_power_kw', mm.drive_power_kw,
          'configured_max_rpm', mm.configured_max_rpm, 'configured_max_pressure_bar', mm.configured_max_pressure_bar,
          'zone_count', mm.zone_count, 'controller_version', mm.controller_version, 'software_version', mm.software_version))
      from public.machines mm where mm.id = v_machine),
    'recipe_version', (select jsonb_build_object('id', rv.id, 'recipe', rc.name, 'version', rv.version, 'status', rv.status)
      from public.process_plans pl join public.recipe_versions rv on rv.id = pl.recipe_version_id
      join public.recipes rc on rc.id = rv.recipe_id where pl.id = v_plan),
    'run', (select jsonb_build_object(
        'id', r.id, 'run_code', r.run_code, 'status', r.status, 'machine_id', r.machine_id,
        'process_plan_id', r.process_plan_id, 'operator_id', r.operator_id,
        'started_at', r.started_at, 'ended_at', r.ended_at, 'created_at', r.created_at, 'created_by', r.created_by)
      from public.runs r where r.id = p_run_id),
    'plan', (select jsonb_build_object(
        'id', p.id, 'version', p.version, 'recipe_version_id', p.recipe_version_id, 'machine_id', p.machine_id,
        'product_target_id', p.product_target_id, 'feed_kg_h', p.feed_kg_h, 'screw_rpm', p.screw_rpm,
        'water_kg_h', p.water_kg_h, 'steam_kg_h', p.steam_kg_h, 'cutter_rpm', p.cutter_rpm,
        'zone_setpoints_c', to_jsonb(p.zone_setpoints_c), 'screw_configuration', p.screw_configuration,
        'die', p.die, 'cutter', p.cutter,
        'decision', jsonb_build_object(
          'status', p.preflight_status, 'confidence_label', p.confidence_label,
          'risk_categories', to_jsonb(p.risk_categories), 'missing_inputs', to_jsonb(p.missing_inputs),
          'decided_at', p.preflight_at,
          'proposed_test', jsonb_build_object(
            'parameter', p.proposed_test_parameter, 'current', p.proposed_test_current,
            'proposed', p.proposed_test_proposed, 'unit', p.proposed_test_unit,
            'zone', p.proposed_test_zone, 'observe_s', p.proposed_test_observe_s)),
        'approval', jsonb_build_object('approved_by', p.approved_by, 'approved_at', p.approved_at),
        'created_at', p.created_at, 'created_by', p.created_by)
      from public.process_plans p where p.id = v_plan),
    'files', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'filename', f.filename, 'sha256', f.sha256, 'size_bytes', f.size_bytes,
        'row_count', f.row_count, 'column_count', f.column_count,
        'created_at', f.created_at, 'created_by', f.created_by) order by f.created_at, f.id)
      from public.run_files f where f.run_id = p_run_id), '[]'::jsonb),
    'quality', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'ruleset_version', q.ruleset_version, 'verdict', q.verdict,
        'created_at', q.created_at, 'created_by', q.created_by) order by q.created_at, q.id)
      from public.quality_assessments q where q.run_id = p_run_id), '[]'::jsonb),
    'state_snapshots', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'quality_assessment_id', s.quality_assessment_id, 'schema_version', s.schema_version,
        'sha256', s.sha256, 'created_at', s.created_at, 'created_by', s.created_by) order by s.created_at, s.id)
      from public.state_snapshots s where s.run_id = p_run_id), '[]'::jsonb),
    'diagnoses', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'snapshot_id', d.snapshot_id, 'gates_version', d.gates_version, 'status', d.status,
        'cause_category', d.cause_category, 'confidence_label', d.confidence_label,
        'created_at', d.created_at, 'created_by', d.created_by) order by d.created_at, d.id)
      from public.diagnoses d where d.run_id = p_run_id), '[]'::jsonb),
    'predictions', coalesce((select jsonb_agg(jsonb_build_object(
        'metric', pp.metric, 'kind', pp.kind, 'value', pp.value, 'min_value', pp.min_value,
        'max_value', pp.max_value, 'unit', pp.unit, 'created_at', pp.created_at) order by pp.created_at, pp.id)
      from public.plan_predictions pp where v_plan is not null and pp.process_plan_id = v_plan), '[]'::jsonb),
    'measurements', coalesce((select jsonb_agg(jsonb_build_object(
        'sample_code', ps.sample_code, 'taken_at', ps.taken_at, 'parameter', m.parameter, 'value', m.value,
        'unit', m.unit, 'method', m.method, 'created_at', m.created_at, 'created_by', m.created_by)
        order by m.created_at, m.id)
      from public.product_measurements m join public.product_samples ps on ps.id = m.product_sample_id
      where ps.run_id = p_run_id), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'kind', v.kind, 'state', v.state, 'evidence_saved', v.evidence_saved,
        'verified_at', v.verified_at, 'created_at', v.created_at, 'created_by', v.created_by)
        order by v.verified_at, v.id)
      from public.verifications v where v.run_id = p_run_id), '[]'::jsonb),
    -- audit-v3: FAIL-loop cases in which this run failed or was the controlled test
    'fail_cases', coalesce((select jsonb_agg(jsonb_build_object(
        'id', fc.id, 'run_id', fc.run_id, 'trigger_verification_id', fc.trigger_verification_id,
        'status', fc.status, 'outcome', fc.outcome, 'outcome_evidence_saved', fc.outcome_evidence_saved,
        'locked_at', fc.locked_at, 'created_at', fc.created_at, 'created_by', fc.created_by,
        'steps', (select coalesce(jsonb_agg(jsonb_build_object('seq', st.seq, 'step', st.step, 'ref_id', st.ref_id,
                    'created_at', st.created_at, 'created_by', st.created_by) order by st.seq), '[]'::jsonb)
                  from public.fail_case_steps st where st.case_id = fc.id),
        'knowledge', (select jsonb_build_object('id', k.id, 'created_at', k.created_at, 'created_by', k.created_by)
                      from public.knowledge_entries k where k.case_id = fc.id))
        order by fc.created_at, fc.id)
      from public.fail_cases fc
      where fc.run_id = p_run_id or exists (select 1 from public.fail_case_steps st
            where st.case_id = fc.id and st.step = 'CONTROLLED_TEST' and st.ref_id = p_run_id)), '[]'::jsonb)
  );

  insert into public.audit_records (organization_id, run_id, snapshot, final_hash)
  values (v_org, p_run_id, v_snap, encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex'))
  returning id into v_id;
  return v_id;
end;
$$;
