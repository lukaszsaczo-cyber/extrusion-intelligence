-- 0010 — atomic write of one data-quality assessment (step 6).
--
-- The quality tables (0008) are append-only, so a partially written assessment
-- could never be removed and would look complete. record_quality_assessment
-- writes the assessment, its per-signal results and its quarantined samples in
-- ONE transaction. SECURITY INVOKER: the caller's RLS applies, so only
-- ADMIN/ENGINEER can record assessments (policies from 0008); no privilege added.

create function public.record_quality_assessment(
  p_run_id uuid,
  p_ruleset_version text,
  p_verdict public.quality_verdict,
  p_signals jsonb,
  p_quarantine jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_assessment uuid;
begin
  select organization_id into v_org from public.runs where id = p_run_id;
  if v_org is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_signals) is distinct from 'array' or jsonb_array_length(p_signals) = 0 then
    raise exception 'assessment has no signal results' using errcode = '22023';
  end if;
  if jsonb_typeof(p_quarantine) is distinct from 'array' then
    raise exception 'quarantine must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_quarantine) > 500000 then
    raise exception 'too many quarantined samples in one assessment' using errcode = '54000';
  end if;

  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict)
  values (v_org, p_run_id, p_ruleset_version, p_verdict)
  returning id into v_assessment;

  insert into public.quality_signal_results
    (organization_id, assessment_id, signal, verdict, reasons, valid_samples, quarantined_samples)
  select v_org, v_assessment, s.signal, s.verdict,
         coalesce((select array_agg(r::public.quality_reason) from jsonb_array_elements_text(s.reasons) as r),
                  '{}'::public.quality_reason[]),
         s.valid_samples, s.quarantined_samples
  from jsonb_to_recordset(p_signals)
    as s(signal text, verdict public.quality_verdict, reasons jsonb, valid_samples integer, quarantined_samples integer);

  insert into public.quality_quarantined_metrics (organization_id, assessment_id, run_id, run_metric_id, reason, detail)
  select v_org, v_assessment, p_run_id, q.run_metric_id, q.reason, q.detail
  from jsonb_to_recordset(p_quarantine)
    as q(run_metric_id uuid, reason public.quality_reason, detail text);

  return v_assessment;
end;
$$;

revoke all on function public.record_quality_assessment(uuid, text, public.quality_verdict, jsonb, jsonb) from public, anon;
grant execute on function public.record_quality_assessment(uuid, text, public.quality_verdict, jsonb, jsonb) to authenticated;
