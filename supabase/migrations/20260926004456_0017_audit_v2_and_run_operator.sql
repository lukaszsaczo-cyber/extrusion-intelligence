-- 0017: audit snapshot audit-v2 and run operator (AR-15).
--
-- The contract's audit export (buildAuditExport, AUDIT_FIELDS) needs the
-- organization, site, machine serial number, machine configuration, recipe
-- version and operator. Earlier snapshots (audit-v1) did not contain them,
-- and no code ever set runs.operator_id.
--   * seal_run_audit now builds audit-v2 = audit-v1 plus organization, site,
--     machine (with configuration) and recipe_version. Existing records keep
--     their hash; they are not rewritten.
--   * tg_run_guard sets operator_id to the signed-in user who starts the run
--     (PLANNED -> RUNNING); a new run cannot carry an operator, and the
--     operator is fixed once the run started, like plan, machine and start time.

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
    'schema', 'audit-v2',
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
      from public.verifications v where v.run_id = p_run_id), '[]'::jsonb)
  );

  insert into public.audit_records (organization_id, run_id, snapshot, final_hash)
  values (v_org, p_run_id, v_snap, encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.tg_run_guard()
returns trigger
language plpgsql
security definer  -- reads the linked plan regardless of the caller's UPDATE policies (FOR SHARE)
set search_path = ''
as $$
declare
  v_machine uuid;
  v_approved timestamptz;
  skew constant interval := interval '5 minutes';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'PLANNED' then
      raise exception 'run_locked: only a PLANNED run can be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'PLANNED' or new.started_at is not null or new.ended_at is not null or new.operator_id is not null then
      raise exception 'run_transition: a run is created as PLANNED without start, end or operator' using errcode = '23514';
    end if;
  else
    if old.status in ('COMPLETED', 'ABORTED')
       and (new.status, new.started_at, new.ended_at, new.process_plan_id, new.machine_id)
           is distinct from (old.status, old.started_at, old.ended_at, old.process_plan_id, old.machine_id) then
      raise exception 'run_locked: a % run is final', old.status using errcode = '23514';
    end if;
    if old.status <> 'PLANNED'
       and (new.process_plan_id, new.machine_id, new.started_at, new.operator_id)
           is distinct from (old.process_plan_id, old.machine_id, old.started_at, old.operator_id) then
      raise exception 'run_locked: plan, machine, start time and operator are fixed once the run started' using errcode = '23514';
    end if;
    if not ((old.status = new.status)
            or (old.status = 'PLANNED' and new.status in ('RUNNING', 'ABORTED'))
            or (old.status = 'RUNNING' and new.status in ('COMPLETED', 'ABORTED'))) then
      raise exception 'run_transition: % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
  end if;

  -- the linked plan must be on the run's machine
  if new.process_plan_id is not null then
    -- FOR SHARE: a concurrent change that voids the approval waits for this row
    select machine_id, approved_at into v_machine, v_approved
    from public.process_plans where id = new.process_plan_id for share;
    if v_machine is distinct from new.machine_id then
      raise exception 'run_machine: the plan is for another machine' using errcode = '23514';
    end if;
  end if;

  if new.status = 'PLANNED' and (new.started_at is not null or new.ended_at is not null) then
    raise exception 'run_transition: a PLANNED run has no start or end time' using errcode = '23514';
  end if;

  if new.status in ('RUNNING', 'COMPLETED') or (new.status = 'ABORTED' and new.started_at is not null) then
    if new.started_at is null then
      raise exception 'run_transition: a started run needs a start time' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status = 'PLANNED' then
      if new.process_plan_id is null or v_approved is null then
        raise exception 'run_not_approved: a run starts only on an approved plan' using errcode = '23514';
      end if;
      if new.started_at > now() + skew then
        raise exception 'run_time: start time is in the future' using errcode = '23514';
      end if;
      -- the operator is the signed-in user who starts the run, never a form value
      new.operator_id := (select auth.uid());
    end if;
  end if;

  if new.status = 'RUNNING' and new.ended_at is not null then
    raise exception 'run_transition: a RUNNING run has no end time' using errcode = '23514';
  end if;
  if new.status = 'COMPLETED' or (new.status = 'ABORTED' and new.started_at is not null) then
    if new.ended_at is null then
      raise exception 'run_transition: an ended run needs an end time' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.ended_at is null and new.ended_at > now() + skew then
      raise exception 'run_time: end time is in the future' using errcode = '23514';
    end if;
  end if;
  if new.status = 'ABORTED' and new.started_at is null and new.ended_at is not null then
    raise exception 'run_transition: a run aborted before start has no end time' using errcode = '23514';
  end if;
  return new;
end;
$$;
