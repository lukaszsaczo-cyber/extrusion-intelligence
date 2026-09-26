-- 0016: fix found by supabase/tests/engine_results.sql before any use.
-- In record_engine_decision a missing JSON field made a validation condition
-- NULL, and `if NULL` does not raise, so e.g. a zone_temperature test without
-- a zone was accepted. Now a missing field has the kind 'missing' and every
-- validation condition that evaluates to NULL refuses (fail closed). Null
-- elements in risk_categories or missing_inputs are refused too.

create or replace function private.json_kind(p jsonb)
returns text language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(p), 'missing');
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

  if private.json_kind(p_decision) is distinct from 'object' or p_decision ->> 'status' is null then
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
  if array_position(v_risks, null) is not null then
    raise exception 'engine_contract: value outside the contract' using errcode = '22023';
  end if;
  select coalesce(array_agg(x), '{}') into v_missing
  from jsonb_array_elements_text(coalesce(p_decision -> 'missing_inputs', '[]'::jsonb)) x;
  if exists (select 1 from unnest(v_missing) c
             where c is null or c !~ '^[a-z][a-z0-9_]{0,31}(\.[a-z][a-z0-9_]{0,31}){0,2}$') then
    raise exception 'engine_contract: missing input is not a contract code' using errcode = '22023';
  end if;

  v_test := p_decision -> 'proposed_test';
  if v_test is not null and private.json_kind(v_test) <> 'null' then
    if coalesce(private.contract_test_unit(v_test ->> 'parameter') is null
       or private.json_kind(v_test -> 'current') <> 'number' or private.json_kind(v_test -> 'proposed') <> 'number'
       or private.json_kind(v_test -> 'observe_s') <> 'number'
       or (v_test ->> 'observe_s')::numeric <> trunc((v_test ->> 'observe_s')::numeric)
       or (v_test ->> 'observe_s')::numeric not between 1 and 86400
       or coalesce(v_test ->> 'unit', private.contract_test_unit(v_test ->> 'parameter')) <> private.contract_test_unit(v_test ->> 'parameter')
       or ((v_test ->> 'parameter') = 'zone_temperature') <> (private.json_kind(v_test -> 'zone') = 'number')
       or (private.json_kind(v_test -> 'zone') = 'number' and ((v_test ->> 'zone')::numeric <> trunc((v_test ->> 'zone')::numeric)
           or (v_test ->> 'zone')::numeric not between 1 and 64)), true) then
      raise exception 'engine_contract: proposed test outside the contract' using errcode = '22023';
    end if;
  else
    v_test := null;
  end if;

  if private.json_kind(coalesce(p_decision -> 'predictions', '[]'::jsonb)) <> 'array' then
    raise exception 'engine_contract: predictions must be a list' using errcode = '22023';
  end if;
  for v_pred in select * from jsonb_array_elements(coalesce(p_decision -> 'predictions', '[]'::jsonb)) loop
    v_unit := private.contract_metric_unit(v_pred ->> 'metric');
    if coalesce(v_unit is null or coalesce(v_pred ->> 'unit', '') <> v_unit
       or not ((v_pred ->> 'kind' = 'VALUE' and private.json_kind(v_pred -> 'value') = 'number')
            or (v_pred ->> 'kind' = 'RANGE' and private.json_kind(v_pred -> 'min') = 'number' and private.json_kind(v_pred -> 'max') = 'number'
                and (v_pred ->> 'min')::numeric <= (v_pred ->> 'max')::numeric)), true) then
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
