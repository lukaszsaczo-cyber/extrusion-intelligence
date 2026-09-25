-- 0011 — state refresh and diagnosis records.
--
-- state_snapshots  the refreshed picture of a run built from CLEAN data only.
--                  It must reference a quality assessment of the same run, so a
--                  snapshot cannot exist before step 6 (quarantine) was done.
--                  sha256 is computed by the application over canonical JSON.
-- diagnoses        the outcome of the diagnosis preconditions (gates) for one
--                  snapshot. A named cause (DIAGNOSED) is refused by the database
--                  unless every gate passed and the data quality was sufficient:
--                  never a forced diagnosis.
--
-- Both append-only; ADMIN/ENGINEER may insert. Nothing is seeded.
--
-- Applied to production 2026-09-25 as version 20260925120519.

create type public.diagnosis_status as enum ('DIAGNOSED', 'INCONCLUSIVE', 'INSUFFICIENT_DATA');

create table public.state_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null,
  quality_assessment_id uuid not null,
  schema_version text not null check (length(schema_version) between 1 and 64),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  unique (id, run_id, organization_id),
  foreign key (run_id, organization_id) references public.runs (id, organization_id) on delete no action,
  foreign key (quality_assessment_id, run_id, organization_id)
    references public.quality_assessments (id, run_id, organization_id) on delete no action
);
create index state_snapshots_organization_id_idx on public.state_snapshots (organization_id);
create index state_snapshots_run_id_idx on public.state_snapshots (run_id, created_at desc);

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null,
  snapshot_id uuid not null,
  gates_version text not null check (length(gates_version) between 1 and 64),
  status public.diagnosis_status not null,
  gates jsonb not null check (jsonb_typeof(gates) = 'array' and jsonb_array_length(gates) > 0),
  cause_category public.reason_category,
  confidence_label public.confidence_label,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  -- a named cause needs a real confidence; no cause without DIAGNOSED
  check (status <> 'DIAGNOSED' or (cause_category is not null and confidence_label is not null
                                   and confidence_label <> 'NOT_AVAILABLE')),
  check (status = 'DIAGNOSED' or (cause_category is null and confidence_label is null)),
  foreign key (snapshot_id, run_id, organization_id)
    references public.state_snapshots (id, run_id, organization_id) on delete no action
);
create index diagnoses_organization_id_idx on public.diagnoses (organization_id);
create index diagnoses_run_id_idx on public.diagnoses (run_id, created_at desc);

-- DIAGNOSED only when every gate passed and the snapshot's data quality was sufficient.
create function private.tg_diagnosis_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare v_verdict public.quality_verdict;
begin
  if new.status = 'DIAGNOSED' then
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

create trigger diagnosis_guard before insert or update on public.diagnoses
  for each row execute function private.tg_diagnosis_guard();

create trigger touch before insert or update on public.state_snapshots
  for each row execute function private.tg_touch();
create trigger touch before insert or update on public.diagnoses
  for each row execute function private.tg_touch();

alter table public.state_snapshots enable row level security;
alter table public.diagnoses enable row level security;

create policy sel on public.state_snapshots for select using (private.is_org_member(organization_id));
create policy ins on public.state_snapshots for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));
create policy sel on public.diagnoses for select using (private.is_org_member(organization_id));
create policy ins on public.diagnoses for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));

revoke all on public.state_snapshots, public.diagnoses from anon;
revoke update, delete, truncate on public.state_snapshots, public.diagnoses from authenticated;
