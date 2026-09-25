-- 0013: sealed, hash-chained audit records per run.
--
-- An audit record is a snapshot of one run's evidence chain (plan, decision,
-- approval, run, files, quality, state snapshots, diagnoses, predictions,
-- measurements, verifications), built inside the database from stored rows so
-- the app cannot put anything else in it. final_hash = SHA-256 of the stored
-- snapshot text. Each snapshot carries the organization's sequence number and
-- the previous record's hash, so a changed or removed record breaks the chain.
-- audit_records stays append-only (tg_audit_immutable).

create or replace function public.seal_run_audit(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_plan uuid;
  v_prev text;
  v_seq integer;
  v_snap jsonb;
  v_id uuid;
begin
  select organization_id, process_plan_id into v_org, v_plan from public.runs where id = p_run_id;
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
    'schema', 'audit-v1',
    'seq', coalesce(v_seq, 0) + 1,
    'previous_hash', v_prev,
    'sealed_at', now(),
    'sealed_by', (select auth.uid()),
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

-- Integrity of every record the caller can see (RLS applies: security invoker).
-- hash_ok: the stored snapshot still hashes to final_hash.
-- chain_ok: sequence has no gap and previous_hash is the predecessor's final_hash.
create or replace function public.audit_integrity(p_org uuid)
returns table (id uuid, seq integer, hash_ok boolean, chain_ok boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id,
         (a.snapshot ->> 'seq')::integer,
         a.final_hash = encode(sha256(convert_to(a.snapshot::text, 'UTF8')), 'hex'),
         (a.snapshot ->> 'seq')::integer is not distinct from
           (row_number() over (order by (a.snapshot ->> 'seq')::integer nulls first, a.created_at, a.id))::integer
         and (a.snapshot ->> 'previous_hash') is not distinct from
           lag(a.final_hash) over (order by (a.snapshot ->> 'seq')::integer nulls first, a.created_at, a.id)
  from public.audit_records a
  where a.organization_id = p_org;
$$;

revoke all on function public.seal_run_audit(uuid) from public, anon;
grant execute on function public.seal_run_audit(uuid) to authenticated;
revoke all on function public.audit_integrity(uuid) from public, anon;
grant execute on function public.audit_integrity(uuid) to authenticated;

-- TRUNCATE skips row triggers and RLS. No client role needs it on any table.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated;
