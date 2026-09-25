-- 0009 — atomic import of one run data file.
--
-- run_metrics and run_files are append-only (0006), so a half-finished import
-- could never be cleaned up. import_run_file writes the file record, all its
-- samples and (optionally) the run's sampling metadata in ONE transaction:
-- either everything is stored or nothing is.
--
-- SECURITY INVOKER: every insert runs under the caller's RLS, so the same roles
-- as before may import (ADMIN/ENGINEER/OPERATOR); no privilege is added.
-- The same file (same SHA-256) cannot be imported twice into the same run.
--
-- Applied to production 2026-09-25 as version 20260925111534.

alter table public.run_files
  add constraint run_files_run_id_sha256_key unique (run_id, sha256);

create function public.import_run_file(
  p_run_id uuid,
  p_filename text,
  p_sha256 text,
  p_size_bytes bigint,
  p_row_count integer,
  p_column_count integer,
  p_sampling jsonb,
  p_metrics jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_file uuid;
  v_existing public.run_sampling%rowtype;
  v_new public.run_sampling%rowtype;
begin
  select organization_id into v_org from public.runs where id = p_run_id;
  if v_org is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_metrics) is distinct from 'array' or jsonb_array_length(p_metrics) = 0 then
    raise exception 'no samples in file' using errcode = '22023';
  end if;
  if jsonb_array_length(p_metrics) > 200000 then
    raise exception 'too many samples in one file' using errcode = '54000';
  end if;

  insert into public.run_files (organization_id, run_id, filename, sha256, size_bytes, row_count, column_count)
  values (v_org, p_run_id, p_filename, p_sha256, p_size_bytes, p_row_count, p_column_count)
  returning id into v_file;

  insert into public.run_metrics (organization_id, run_id, run_file_id, signal, ts, value, raw_text, unit, quality)
  select v_org, p_run_id, v_file, m.signal, m.ts, m.value, m.raw_text, m.unit, m.quality
  from jsonb_to_recordset(p_metrics)
    as m(signal text, ts timestamptz, value numeric, raw_text text, unit text, quality public.signal_quality);

  -- Sampling metadata is write-once per run (0007). A later file for the same
  -- run must declare the same values, otherwise the import is rejected.
  if p_sampling is not null then
    v_new.sampling_interval_ms := (p_sampling ->> 'sampling_interval_ms')::integer;
    v_new.timestamp_source := (p_sampling ->> 'timestamp_source')::public.timestamp_source;
    v_new.timestamp_resolution_ms := (p_sampling ->> 'timestamp_resolution_ms')::integer;
    v_new.missing_sample_policy := (p_sampling ->> 'missing_sample_policy')::public.missing_sample_policy;
    v_new.source_timezone := p_sampling ->> 'source_timezone';

    select * into v_existing from public.run_sampling where run_id = p_run_id;
    if not found then
      insert into public.run_sampling (organization_id, run_id, sampling_interval_ms, timestamp_source,
        timestamp_resolution_ms, missing_sample_policy, source_timezone)
      values (v_org, p_run_id, v_new.sampling_interval_ms, v_new.timestamp_source,
        v_new.timestamp_resolution_ms, v_new.missing_sample_policy, v_new.source_timezone);
    elsif (v_existing.sampling_interval_ms, v_existing.timestamp_source, v_existing.timestamp_resolution_ms,
           v_existing.missing_sample_policy, v_existing.source_timezone)
      is distinct from
          (v_new.sampling_interval_ms, v_new.timestamp_source, v_new.timestamp_resolution_ms,
           v_new.missing_sample_policy, v_new.source_timezone) then
      raise exception 'sampling metadata differs from the value already recorded for this run'
        using errcode = '23514';
    end if;
  end if;

  return v_file;
end;
$$;

revoke all on function public.import_run_file(uuid, text, text, bigint, integer, integer, jsonb, jsonb) from public, anon;
grant execute on function public.import_run_file(uuid, text, text, bigint, integer, integer, jsonb, jsonb) to authenticated;
