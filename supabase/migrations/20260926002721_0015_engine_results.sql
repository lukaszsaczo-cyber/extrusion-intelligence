-- 0015: engine results (decision, predictions, verification) written only by
-- the app server, only in the shape of ei-engine-contract.
--
-- The functions are SECURITY DEFINER because decision and verification columns
-- are writable only by a trusted role (tg_plan_guard, no insert policy on
-- verifications). A signed-in user could call them directly, so they also
-- require an engine write key: a random secret held only by the app server
-- (env ENGINE_WRITE_KEY). The database stores only its SHA-256. The key opens
-- these two functions and nothing else (unlike the service role key).
--
-- Validation repeats the contract (server/engine-contract/src/contract.js and
-- sanitizer.js): statuses, confidence labels, risk categories, metric units,
-- test parameters and the missing-input code pattern. A unit test keeps the
-- maps below equal to the contract.

-- The contract's verification is for the whole run and has no kind.
alter type public.verification_kind add value if not exists 'ENGINE';

create table private.engine_write_keys (
  id uuid primary key default gen_random_uuid(),
  key_sha256 text not null unique check (key_sha256 ~ '^[0-9a-f]{64}$'),
  label text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
revoke all on private.engine_write_keys from public, anon, authenticated;

create or replace function private.engine_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_key is not null and length(p_key) >= 32 and exists (
    select 1 from private.engine_write_keys k
    where k.revoked_at is null and k.key_sha256 = encode(sha256(convert_to(p_key, 'UTF8')), 'hex'));
$$;
revoke all on function private.engine_key_ok(text) from public, anon, authenticated;

-- Units owned by the contract (METRICS, TEST_PARAMETERS).
create or replace function private.contract_metric_unit(p_metric text)
returns text language sql immutable set search_path = '' as $$
  select case p_metric
    when 'pressure' then 'bar' when 'product_temperature' then '°C' when 'melt_temperature' then '°C'
    when 'motor_load' then '%' when 'torque' then '%' when 'moisture' then '%' when 'sme' then 'Wh/kg' end;
$$;
create or replace function private.contract_test_unit(p_parameter text)
returns text language sql immutable set search_path = '' as $$
  select case p_parameter
    when 'feed_rate' then 'kg/h' when 'screw_speed' then 'rpm' when 'water_rate' then 'kg/h'
    when 'steam_rate' then 'kg/h' when 'zone_temperature' then '°C' when 'cutter_speed' then 'rpm' end;
$$;

create or replace function public.record_engine_decision(
  p_key text, p_plan uuid, p_plan_updated_at timestamptz, p_decision jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
  v_status public.decision_status;
  v_conf public.confidence_label;
  v_risks public.reason_category[];
  v_missing text[];
  v_test jsonb;
  v_pred jsonb;
  v_unit text;
begin
  if not private.engine_key_ok(p_key) then
    raise exception 'engine_key: engine write key missing or not registered' using errcode = '42501';
  end if;
  select id, organization_id, updated_at, approved_at into v_plan from public.process_plans where id = p_plan for update;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(v_plan.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_plan.updated_at is distinct from p_plan_updated_at then
    raise exception 'engine_stale: the plan changed after the engine was asked' using errcode = '40001';
  end if;
  if v_plan.approved_at is not null then
    raise exception 'engine_locked: the plan is already approved' using errcode = '23514';
  end if;

  if jsonb_typeof(p_decision) is distinct from 'object' or p_decision ->> 'status' is null then
    raise exception 'engine_contract: decision needs a contract status' using errcode = '22023';
  end if;
  begin
    v_status := (p_decision ->> 'status')::public.decision_status;
    v_conf := coalesce(p_decision ->> 'confidence_label', 'NOT_AVAILABLE')::public.confidence_label;
    v_risks := coalesce((select array_agg(x::public.reason_category)
                         from jsonb_array_elements_text(coalesce(p_decision -> 'risk_categories', '[]'::jsonb)) x), '{}');
  exception when invalid_text_representation or cannot_coerce or invalid_parameter_value then
    raise exception 'engine_contract: value outside the contract' using errcode = '22023';
  end;
  select coalesce(array_agg(x), '{}') into v_missing
  from jsonb_array_elements_text(coalesce(p_decision -> 'missing_inputs', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_missing) c
             where c !~ '^[a-z][a-z0-9_]{0,31}(\.[a-z][a-z0-9_]{0,31}){0,2}$') then
    raise exception 'engine_contract: missing input is not a contract code' using errcode = '22023';
  end if;

  v_test := p_decision -> 'proposed_test';
  if v_test is not null and jsonb_typeof(v_test) <> 'null' then
    if private.contract_test_unit(v_test ->> 'parameter') is null
       or jsonb_typeof(v_test -> 'current') <> 'number' or jsonb_typeof(v_test -> 'proposed') <> 'number'
       or jsonb_typeof(v_test -> 'observe_s') <> 'number'
       or (v_test ->> 'observe_s')::numeric <> trunc((v_test ->> 'observe_s')::numeric)
       or (v_test ->> 'observe_s')::numeric not between 1 and 86400
       or coalesce(v_test ->> 'unit', private.contract_test_unit(v_test ->> 'parameter')) <> private.contract_test_unit(v_test ->> 'parameter')
       or ((v_test ->> 'parameter') = 'zone_temperature') <> (jsonb_typeof(v_test -> 'zone') = 'number')
       or (jsonb_typeof(v_test -> 'zone') = 'number' and ((v_test ->> 'zone')::numeric <> trunc((v_test ->> 'zone')::numeric)
           or (v_test ->> 'zone')::numeric not between 1 and 64)) then
      raise exception 'engine_contract: proposed test outside the contract' using errcode = '22023';
    end if;
  else
    v_test := null;
  end if;

  if jsonb_typeof(coalesce(p_decision -> 'predictions', '[]'::jsonb)) <> 'array' then
    raise exception 'engine_contract: predictions must be a list' using errcode = '22023';
  end if;
  for v_pred in select * from jsonb_array_elements(coalesce(p_decision -> 'predictions', '[]'::jsonb)) loop
    v_unit := private.contract_metric_unit(v_pred ->> 'metric');
    if v_unit is null or coalesce(v_pred ->> 'unit', '') <> v_unit
       or not ((v_pred ->> 'kind' = 'VALUE' and jsonb_typeof(v_pred -> 'value') = 'number')
            or (v_pred ->> 'kind' = 'RANGE' and jsonb_typeof(v_pred -> 'min') = 'number' and jsonb_typeof(v_pred -> 'max') = 'number'
                and (v_pred ->> 'min')::numeric <= (v_pred ->> 'max')::numeric)) then
      raise exception 'engine_contract: prediction outside the contract' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) <> count(distinct e ->> 'metric') from jsonb_array_elements(coalesce(p_decision -> 'predictions', '[]'::jsonb)) e) then
    raise exception 'engine_contract: duplicate metric' using errcode = '22023';
  end if;

  update public.process_plans set
    preflight_status = v_status, confidence_label = v_conf, risk_categories = v_risks, missing_inputs = v_missing,
    preflight_at = now(),
    proposed_test_parameter = v_test ->> 'parameter',
    proposed_test_current = (v_test ->> 'current')::numeric,
    proposed_test_proposed = (v_test ->> 'proposed')::numeric,
    proposed_test_unit = private.contract_test_unit(v_test ->> 'parameter'),
    proposed_test_zone = (v_test ->> 'zone')::integer,
    proposed_test_observe_s = (v_test ->> 'observe_s')::integer
  where id = p_plan;

  delete from public.plan_predictions where process_plan_id = p_plan;
  insert into public.plan_predictions (organization_id, process_plan_id, metric, kind, value, min_value, max_value, unit)
  select v_plan.organization_id, p_plan, (e ->> 'metric')::public.prediction_metric, (e ->> 'kind')::public.prediction_kind,
         (e ->> 'value')::numeric, (e ->> 'min')::numeric, (e ->> 'max')::numeric, e ->> 'unit'
  from jsonb_array_elements(coalesce(p_decision -> 'predictions', '[]'::jsonb)) e;
end;
$$;

create or replace function public.record_engine_verification(p_key text, p_run uuid, p_verification jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run record;
  v_state public.verification_state;
  v_id uuid;
begin
  if not private.engine_key_ok(p_key) then
    raise exception 'engine_key: engine write key missing or not registered' using errcode = '42501';
  end if;
  select id, organization_id, status into v_run from public.runs where id = p_run;
  if not found then raise exception 'run not found' using errcode = 'P0002'; end if;
  if not private.has_org_role(v_run.organization_id, array['ADMIN','ENGINEER']::public.app_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_run.status <> 'COMPLETED' then
    raise exception 'engine_run_not_completed: a run is verified after it is completed' using errcode = '23514';
  end if;
  begin
    v_state := (p_verification ->> 'state')::public.verification_state;
  exception when invalid_text_representation then
    raise exception 'engine_contract: state outside the contract' using errcode = '22023';
  end;
  if v_state is null then
    raise exception 'engine_contract: verification needs a contract state' using errcode = '22023';
  end if;
  insert into public.verifications (organization_id, run_id, kind, state, evidence_saved, verified_at)
  values (v_run.organization_id, p_run, 'ENGINE', v_state,
          -- contract: evidence counts only for VERIFIED_PASS with a strict boolean true
          v_state = 'VERIFIED_PASS' and (p_verification -> 'evidence_saved') = 'true'::jsonb, now())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_engine_decision(text, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.record_engine_decision(text, uuid, timestamptz, jsonb) to authenticated;
revoke all on function public.record_engine_verification(text, uuid, jsonb) from public, anon;
grant execute on function public.record_engine_verification(text, uuid, jsonb) to authenticated;
