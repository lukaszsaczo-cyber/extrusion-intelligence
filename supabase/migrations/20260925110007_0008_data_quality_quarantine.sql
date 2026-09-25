-- 0008 — data-quality quarantine layer (step 6 of the diagnostic loop).
--
-- Raw evidence (run_metrics, append-only since 0006) is never edited. A quality
-- check instead records its judgement next to it:
--
--   quality_assessments        one pass of the rules over one run (append-only;
--                              re-checking with calibrated rules = a new row)
--   quality_signal_results     per-signal outcome of that pass, incl. why data
--                              was insufficient, so the operator can be told
--                              exactly what is missing
--   quality_quarantined_metrics  the individual samples excluded, with reason
--
-- Verdicts: VALID (usable for diagnosis), QUARANTINED (some samples excluded),
-- INSUFFICIENT_DATA (no reliable analysis possible). INSUFFICIENT_DATA is not
-- INCONCLUSIVE: the latter belongs to diagnosis/verification, not data quality.
--
-- Only ADMIN/ENGINEER may record assessments: excluding samples changes what a
-- diagnosis sees, so it must not be available to every role. Nothing is seeded.
--
-- Applied to production 2026-09-25 as version 20260925110007.

create type public.quality_verdict as enum ('VALID', 'QUARANTINED', 'INSUFFICIENT_DATA');

create type public.quality_reason as enum (
  -- sample-level (quarantine)
  'SOURCE_FLAGGED',           -- run_metrics.quality was SUSPECT/MISSING/UNMAPPED
  'PHYSICALLY_IMPOSSIBLE',
  'OUTSIDE_CONFIRMED_LIMITS',
  'SPIKE',
  'FLATLINE',
  'CROSS_SIGNAL_INCONSISTENT',
  'TIMESTAMP_GAP',
  'TIMESTAMP_NON_MONOTONIC',
  'TIMESTAMP_DUPLICATE',
  'ISOLATED_DEVIATION',
  'MANUAL',
  -- signal/run-level (insufficient data)
  'SAMPLING_METADATA_MISSING',
  'SIGNAL_NOT_MAPPED',
  'SIGNAL_NOT_AVAILABLE',
  'TOO_FEW_VALID_SAMPLES'
);

-- Lets child rows prove that a sample belongs to the assessed run.
alter table public.run_metrics
  add constraint run_metrics_id_run_id_organization_id_key unique (id, run_id, organization_id);

-- 1. Assessments ------------------------------------------------------------

create table public.quality_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null,
  ruleset_version text not null check (length(ruleset_version) between 1 and 64),
  verdict public.quality_verdict not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  unique (id, run_id, organization_id),
  foreign key (run_id, organization_id) references public.runs (id, organization_id) on delete no action
);
create index quality_assessments_organization_id_idx on public.quality_assessments (organization_id);
create index quality_assessments_run_id_idx on public.quality_assessments (run_id, created_at desc);

-- 2. Per-signal results -----------------------------------------------------

create table public.quality_signal_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assessment_id uuid not null,
  signal text not null check (length(signal) between 1 and 200),
  verdict public.quality_verdict not null,
  reasons public.quality_reason[] not null default '{}',
  valid_samples integer not null check (valid_samples >= 0),
  quarantined_samples integer not null check (quarantined_samples >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  unique (assessment_id, signal),
  -- a non-VALID outcome must say why
  check (verdict = 'VALID' or cardinality(reasons) > 0),
  foreign key (assessment_id, organization_id)
    references public.quality_assessments (id, organization_id) on delete no action
);
create index quality_signal_results_organization_id_idx on public.quality_signal_results (organization_id);

-- 3. Quarantined samples ----------------------------------------------------

create table public.quality_quarantined_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assessment_id uuid not null,
  run_id uuid not null,
  run_metric_id uuid not null,
  reason public.quality_reason not null check (reason in (
    'SOURCE_FLAGGED', 'PHYSICALLY_IMPOSSIBLE', 'OUTSIDE_CONFIRMED_LIMITS', 'SPIKE', 'FLATLINE',
    'CROSS_SIGNAL_INCONSISTENT', 'TIMESTAMP_GAP', 'TIMESTAMP_NON_MONOTONIC', 'TIMESTAMP_DUPLICATE',
    'ISOLATED_DEVIATION', 'MANUAL')),
  detail text check (detail is null or length(detail) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  unique (assessment_id, run_metric_id, reason),
  -- the sample and the assessment must belong to the same run and organization
  foreign key (assessment_id, run_id, organization_id)
    references public.quality_assessments (id, run_id, organization_id) on delete no action,
  foreign key (run_metric_id, run_id, organization_id)
    references public.run_metrics (id, run_id, organization_id) on delete no action
);
create index quality_quarantined_metrics_organization_id_idx on public.quality_quarantined_metrics (organization_id);
create index quality_quarantined_metrics_run_metric_id_idx on public.quality_quarantined_metrics (run_metric_id);

-- 4. Common setup: touch trigger, append-only RLS, grants -------------------

create trigger touch before insert or update on public.quality_assessments
  for each row execute function private.tg_touch();
create trigger touch before insert or update on public.quality_signal_results
  for each row execute function private.tg_touch();
create trigger touch before insert or update on public.quality_quarantined_metrics
  for each row execute function private.tg_touch();

alter table public.quality_assessments enable row level security;
alter table public.quality_signal_results enable row level security;
alter table public.quality_quarantined_metrics enable row level security;

create policy sel on public.quality_assessments for select using (private.is_org_member(organization_id));
create policy ins on public.quality_assessments for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));
create policy sel on public.quality_signal_results for select using (private.is_org_member(organization_id));
create policy ins on public.quality_signal_results for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));
create policy sel on public.quality_quarantined_metrics for select using (private.is_org_member(organization_id));
create policy ins on public.quality_quarantined_metrics for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));

revoke all on public.quality_assessments, public.quality_signal_results, public.quality_quarantined_metrics from anon;
revoke update, delete, truncate on public.quality_assessments, public.quality_signal_results, public.quality_quarantined_metrics from authenticated;
