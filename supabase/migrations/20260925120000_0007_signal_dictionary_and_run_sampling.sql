-- 0007 — signal dictionary and per-run sampling metadata.
--
-- Data-quality rules ("flat for 60 s", "gap > 2x interval") are meaningless
-- without knowing how a run was sampled. This migration adds the places to
-- record that, and a per-organization vocabulary of canonical signal names.
--
-- Nothing is seeded: tags and sampling rates are not known yet and are not
-- guessed. A NULL field means "not known"; quality rules must then return
-- INSUFFICIENT_DATA instead of assuming a value.
--
-- run_metrics stays untouched: it keeps raw source signal names (evidence).
-- machine_sensor_tags maps a raw tag to a canonical signal from the dictionary.

-- 1. Signal dictionary ------------------------------------------------------

create type public.signal_category as enum ('PROCESS', 'MATERIAL', 'PRODUCT', 'MACHINE_STATE');

create table public.signal_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,63}$'),
  category public.signal_category not null,
  canonical_unit text check (canonical_unit is null or length(canonical_unit) between 1 and 32),
  description text check (description is null or length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  unique (organization_id, code)
);
create index signal_definitions_organization_id_idx on public.signal_definitions (organization_id);

create trigger touch before insert or update on public.signal_definitions
  for each row execute function private.tg_touch();

alter table public.signal_definitions enable row level security;
create policy sel on public.signal_definitions for select
  using (private.is_org_member(organization_id));
create policy ins on public.signal_definitions for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));
create policy upd on public.signal_definitions for update
  using (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));
create policy del on public.signal_definitions for delete
  using (private.has_org_role(organization_id, array['ADMIN','ENGINEER']::public.app_role[]));

revoke all on public.signal_definitions from anon;
revoke truncate on public.signal_definitions from authenticated;

-- A tag's canonical signal must exist in the dictionary of the same organization.
-- A definition in use cannot be deleted (NO ACTION). machine_sensor_tags is empty.
alter table public.machine_sensor_tags
  add constraint machine_sensor_tags_signal_fkey
    foreign key (organization_id, signal)
    references public.signal_definitions (organization_id, code)
    on update cascade on delete no action;

-- 2. Per-run sampling metadata ---------------------------------------------

create type public.timestamp_source as enum ('PLC', 'HISTORIAN', 'IMPORT_FILE', 'MANUAL');
create type public.missing_sample_policy as enum ('NOT_FILLED', 'MARKED_MISSING', 'FORWARD_FILLED', 'INTERPOLATED');

create table public.run_sampling (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null,
  sampling_interval_ms integer check (sampling_interval_ms is null or sampling_interval_ms between 1 and 86400000),
  timestamp_source public.timestamp_source,
  timestamp_resolution_ms integer check (timestamp_resolution_ms is null or timestamp_resolution_ms between 1 and 86400000),
  missing_sample_policy public.missing_sample_policy,
  source_timezone text check (source_timezone is null or length(source_timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (id, organization_id),
  unique (run_id),
  foreign key (run_id, organization_id) references public.runs (id, organization_id) on delete no action
);
create index run_sampling_organization_id_idx on public.run_sampling (organization_id);

create trigger touch before insert or update on public.run_sampling
  for each row execute function private.tg_touch();

-- Sampling metadata decides how evidence is judged, so it is write-once like
-- run_metrics (0006): no UPDATE/DELETE policies or grants for app users.
alter table public.run_sampling enable row level security;
create policy sel on public.run_sampling for select
  using (private.is_org_member(organization_id));
create policy ins on public.run_sampling for insert
  with check (private.has_org_role(organization_id, array['ADMIN','ENGINEER','OPERATOR']::public.app_role[]));

revoke all on public.run_sampling from anon;
revoke update, delete, truncate on public.run_sampling from authenticated;
