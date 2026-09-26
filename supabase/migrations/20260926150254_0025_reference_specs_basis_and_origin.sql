-- 0025: corrections to the reference catalog after review, each checked against the source.
-- 1. MPC protein basis (ADPI Concentrated Milk Proteins Standard v2.1, footnote 1:
--    "For MPC 85 and MPI the protein limits are on a dry basis instead of the as-is
--    basis"): MPC 40-80 as is, MPC 85 and MPI dry basis; lactose, fat, ash as is.
-- 2. The dry whey limits come from the table "Codex Alimentarius Specifications for
--    Dry Whey" reproduced in the ADPI standard: recorded in the new table_origin.
-- 3. The pH row of that table was missing: sweet whey pH >= 6.0, acid whey pH <= 5.1.

alter table public.reference_material_specs
  add column table_origin text check (table_origin is null or length(table_origin) <= 200);
comment on column public.reference_material_specs.table_origin is
  'Origin of the table the value is quoted from, when it differs from the document publisher (e.g. a Codex table reproduced in an ADPI standard).';

update public.reference_material_specs set basis = 'as is'
where source_url = 'https://adpi.org/wp-content/uploads/2023/10/Concentrated-Milk-Proteins-Standard-v2.1_2023.pdf'
  and parameter = 'protein' and code in ('MPC 40', 'MPC 42', 'MPC 56', 'MPC 70', 'MPC 80');
update public.reference_material_specs set basis = 'dry basis'
where source_url = 'https://adpi.org/wp-content/uploads/2023/10/Concentrated-Milk-Proteins-Standard-v2.1_2023.pdf'
  and parameter = 'protein' and code in ('MPC 85', 'MPI');
update public.reference_material_specs set basis = 'as is'
where source_url = 'https://adpi.org/wp-content/uploads/2023/10/Concentrated-Milk-Proteins-Standard-v2.1_2023.pdf'
  and parameter in ('lactose', 'fat', 'ash');

update public.reference_material_specs
set table_origin = 'Codex Alimentarius Specifications for Dry Whey (reproduced in ADPI Dry Whey Standard v4)'
where source_url = 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf';

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on, table_origin) values
  ('Sweet whey powder', 'Dry Whey Standard v4 (dry sweet whey)', 'American Dairy Products Institute (ADPI)', 'pH', 'pH', null, 'MIN', 6.0, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26', 'Codex Alimentarius Specifications for Dry Whey (reproduced in ADPI Dry Whey Standard v4)'),
  ('Acid whey powder', 'Dry Whey Standard v4 (dry acid whey)', 'American Dairy Products Institute (ADPI)', 'pH', 'pH', null, 'MAX', null, 5.1, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26', 'Codex Alimentarius Specifications for Dry Whey (reproduced in ADPI Dry Whey Standard v4)');
