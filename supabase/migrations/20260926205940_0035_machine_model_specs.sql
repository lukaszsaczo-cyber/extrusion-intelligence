-- 0035: reference catalog of extruder models, for the case where the operator cannot
-- read the machine's nameplate on site (photos of the HMI only). Same discipline as
-- reference_material_specs (0023): a row is either verified from a cited primary
-- source (source_org/source_url/retrieved_on set, verified = true), or it is a bare
-- placeholder (verified = false, all spec columns null) so the model name can still be
-- picked from a list without inventing a number for it. Read-only for users.

create table public.machine_model_specs (
  model_code text primary key check (length(model_code) between 1 and 64),
  manufacturer text not null check (length(manufacturer) between 1 and 100),
  family text check (family is null or length(family) <= 64),
  screw_diameter_mm numeric check (screw_diameter_mm is null or screw_diameter_mm > 0),
  l_d_min numeric check (l_d_min is null or l_d_min > 0),
  l_d_max numeric check (l_d_max is null or l_d_max > 0),
  max_solid_feed_kg_h numeric check (max_solid_feed_kg_h is null or max_solid_feed_kg_h > 0),
  max_liquid_feed_l_h numeric check (max_liquid_feed_l_h is null or max_liquid_feed_l_h > 0),
  zone_count_typical integer check (zone_count_typical is null or (zone_count_typical between 1 and 64)),
  verified boolean not null default false,
  source_org text check (source_org is null or length(source_org) <= 200),
  source_url text check (source_url is null or source_url ~ '^https://'),
  retrieved_on date,
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  check (not verified or (source_org is not null and source_url is not null and retrieved_on is not null))
);
comment on table public.machine_model_specs is
  'Reference catalog of extruder models and their published capacity limits. A verified row is quoted from a cited primary source; an unverified row is a bare placeholder (name only, no invented numbers), for when the operator can identify the model name but not read its nameplate.';

alter table public.machine_model_specs enable row level security;
create policy sel on public.machine_model_specs for select to authenticated using (true);
revoke all on public.machine_model_specs from anon;
revoke insert, update, delete, truncate on public.machine_model_specs from authenticated;

insert into public.machine_model_specs
  (model_code, manufacturer, family, screw_diameter_mm, l_d_min, l_d_max, max_solid_feed_kg_h, max_liquid_feed_l_h, zone_count_typical, verified, source_org, source_url, retrieved_on, note)
values
  ('Evolum 25', 'Clextral', 'Evolum', 25, 24, 40, 25.0, 40.0, null, true,
   'Ribeiro, Piñero, Parle, Blanco, Roman (2024), Foods 13(11):1748',
   'https://www.mdpi.com/2304-8158/13/11/1748',
   '2026-09-26',
   'L/D and zone count vary by configuration between published Evolum 25 trials (6 to 10 zones seen); only the maximum feed rates and screw diameter are stated as machine limits in this source.'),
  ('Evolum 32', 'Clextral', 'Evolum', null, null, null, null, null, null, false, null, null, null,
   'Name only. Screw diameter, feed limits and zone count not yet confirmed from a primary source.'),
  ('Evolum 44', 'Clextral', 'Evolum', null, null, null, null, null, null, false, null, null, null,
   'Name only. Screw diameter, feed limits and zone count not yet confirmed from a primary source.'),
  ('Evolum 53', 'Clextral', 'Evolum', null, null, null, null, null, null, false, null, null, null,
   'Name only. Screw diameter, feed limits and zone count not yet confirmed from a primary source.'),
  ('Evolum 62', 'Clextral', 'Evolum', null, null, null, null, null, null, false, null, null, null,
   'Name only. Screw diameter, feed limits and zone count not yet confirmed from a primary source.'),
  ('Evolum HT25', 'Clextral', 'Evolum', null, null, null, null, null, null, false, null, null, null,
   'A distinct sub-line from plain Evolum 25 in the sources found so far (different L/D and feed rate in the one trial read in full); its own limits not yet confirmed.'),
  ('Evolum HU 88', 'Clextral', 'Evolum', null, null, null, null, null, null, false, null, null, null,
   'Name only. A used-equipment listing gives 72 mm screw and 700 kg/h max, but that is a reseller listing, not a primary technical source, so it is not recorded as verified here.'),
  ('other / unknown', 'unknown', null, null, null, null, null, null, null, false, null, null, null,
   'Use when the model cannot be identified from the HMI or a photo. Enter what is known directly in the machine''s own fields.');
