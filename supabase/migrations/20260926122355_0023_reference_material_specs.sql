-- 0023: reference catalog of published raw-material specifications. Each value is
-- quoted from the cited source (standard or supplier specification) with the date it
-- was read. A specification, never a measurement of a lot. Read-only for users.

create type public.spec_kind as enum ('MIN', 'MAX', 'TYPICAL_RANGE');

create table public.reference_material_specs (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(code) between 1 and 64),
  product_name text not null check (length(product_name) between 1 and 200),
  source_org text not null check (length(source_org) between 1 and 200),
  parameter text not null check (length(parameter) between 1 and 64),
  unit text not null check (length(unit) between 1 and 32),
  basis text check (basis is null or length(basis) <= 64),
  kind public.spec_kind not null,
  value_min numeric,
  value_max numeric,
  method text check (method is null or length(method) <= 100),
  source_url text not null check (source_url ~ '^https://'),
  retrieved_on date not null,
  created_at timestamptz not null default now(),
  check ((kind = 'MIN' and value_min is not null and value_max is null)
      or (kind = 'MAX' and value_max is not null and value_min is null)
      or (kind = 'TYPICAL_RANGE' and value_min is not null and value_max is not null and value_min <= value_max))
);
comment on table public.reference_material_specs is
  'Published specification values of raw materials, quoted from the cited source. A specification or standard, never a measurement of a lot.';

alter table public.reference_material_specs enable row level security;
create policy sel on public.reference_material_specs for select to authenticated using (true);
revoke all on public.reference_material_specs from anon;
revoke insert, update, delete, truncate on public.reference_material_specs from authenticated;

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on) values
  ('WPI 90', 'Whey Protein Isolate (WPI) Standard v4.0', 'American Dairy Products Institute (ADPI)', 'protein', '%', 'dry basis', 'MIN', 89.5, null, null, 'https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate (WPI) Standard v4.0', 'American Dairy Products Institute (ADPI)', 'protein', '%', 'dry basis', 'TYPICAL_RANGE', 90.0, 92.0, null, 'https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate (WPI) Standard v4.0', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'total', 'MAX', null, 6.0, null, 'https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate (WPI) Standard v4.0', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'total', 'TYPICAL_RANGE', 4.0, 5.0, null, 'https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate 90% Instant', 'FDCM', 'protein', '%', 'dry matter (N x 6.38)', 'MIN', 90.0, null, 'VDLUFA C 30.2', 'https://fdcm.eu/wp-content/uploads/2025/07/FDCM_Whey_Protein_Isolate_90_Instant_WPI_90_Instant.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate 90% Instant', 'FDCM', 'fat', '%', null, 'MAX', null, 1.5, 'VDLUFA C 15.2.3', 'https://fdcm.eu/wp-content/uploads/2025/07/FDCM_Whey_Protein_Isolate_90_Instant_WPI_90_Instant.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate 90% Instant', 'FDCM', 'ash (550 °C)', '%', null, 'MAX', null, 3.5, 'VDLUFA C 10.2', 'https://fdcm.eu/wp-content/uploads/2025/07/FDCM_Whey_Protein_Isolate_90_Instant_WPI_90_Instant.pdf', '2026-09-26'),
  ('WPI 90', 'Whey Protein Isolate 90% Instant', 'FDCM', 'water (102 °C)', '%', null, 'MAX', null, 6.0, 'VDLUFA C 35.6', 'https://fdcm.eu/wp-content/uploads/2025/07/FDCM_Whey_Protein_Isolate_90_Instant_WPI_90_Instant.pdf', '2026-09-26');
