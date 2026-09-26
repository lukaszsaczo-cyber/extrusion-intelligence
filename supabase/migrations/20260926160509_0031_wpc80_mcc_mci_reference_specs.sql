-- 0031: WPC 80 and microfiltered milk proteins / micellar casein (MMPC, MCC, MMPI, MCI).
--
-- 1. WPC 80, ADPI Whey Protein Concentrate page (HTML tables read 2026-09-26), the same
--    table as WPC 34 in 0024. Footnote (1): "For WPC 80 the protein content, typical
--    values, and limit are on the dry basis instead of the as-is basis. All other units in
--    the table are on the as-is basis." Lactose and ash have no limit ("--"), so only
--    their typical range is stored. Methods from the page's "Methods of Analysis" table.
--    Not stored: the single-column physico-chemical table (pH 6.0-6.7, scorched
--    particles), as for WPC 34.
-- 2. ADPI Concentrated Milk Proteins Standard v2.1 (PDF, the same document as the MPC rows
--    in 0024/0025), table "Microfiltered Milk Protein Concentrates (MMPCs) and Isolates
--    (MMPIs); and Micellar Casein Concentrates (MCCs) and Isolates (MCIs)". The table
--    says: protein limits are minima, all other limits are maxima. Footnote 2: for the 85
--    and isolate products protein is on a dry basis; all other units are as is. The
--    columns 42/70/80/85 cover MMPC or MCC; the last column is "MMPI or MCI".

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select 'WPC 80', w.product_name, w.source_org, x.parameter, '%', x.basis, x.kind::public.spec_kind, x.vmin, x.vmax, x.method,
       'https://adpi.org/ingredient-resources/whey-protein-concentrate/', date '2026-09-26'
from (select product_name, source_org from public.reference_material_specs where code = 'WPC 34' limit 1) w
cross join (values
  ('protein', 'dry basis', 'MIN', 79.5::numeric, null::numeric, 'AOAC 991.20 (N x 6.38)'),
  ('protein', 'dry basis', 'TYPICAL_RANGE', 80.0, 82.0, 'AOAC 991.20 (N x 6.38)'),
  ('lactose', 'as is', 'TYPICAL_RANGE', 4.0, 10.0, 'ISO 22662 / IDF 198'),
  ('fat', 'as is', 'MAX', null, 10.0, 'AOAC 989.05'),
  ('fat', 'as is', 'TYPICAL_RANGE', 4.0, 8.0, 'AOAC 989.05'),
  ('moisture', 'total', 'MAX', null, 6.0, 'AOAC 925.45'),
  ('moisture', 'total', 'TYPICAL_RANGE', 3.0, 5.0, 'AOAC 925.45'),
  ('ash', 'as is', 'TYPICAL_RANGE', 3.0, 5.0, 'AOAC 942.05')
) as x(parameter, basis, kind, vmin, vmax, method);

-- Methods for WPC 34 from the same page's methods table.
update public.reference_material_specs s
set method = m.method
from (values
  ('protein', 'AOAC 991.20 (N x 6.38)'),
  ('lactose', 'ISO 22662 / IDF 198'),
  ('fat', 'AOAC 989.05'),
  ('moisture', 'AOAC 925.45'),
  ('ash', 'AOAC 942.05')
) as m(parameter, method)
where s.code = 'WPC 34' and s.parameter = m.parameter and s.method is null
  and s.source_url = 'https://adpi.org/ingredient-resources/whey-protein-concentrate/';

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select g.code, 'Concentrated Milk Proteins Standard v2.1 (' || g.label || ')', 'American Dairy Products Institute (ADPI)',
       p.parameter, '%',
       case when p.parameter = 'protein' then g.protein_basis when p.parameter = 'moisture' then 'total' else 'as is' end,
       p.kind::public.spec_kind,
       case when p.kind = 'MIN' then p.v end, case when p.kind = 'MAX' then p.v end,
       p.method, 'https://adpi.org/wp-content/uploads/2023/10/Concentrated-Milk-Proteins-Standard-v2.1_2023.pdf', date '2026-09-26'
from (values
  ('MCC 42', 'MMPC or MCC 42', 'as is', 41.5::numeric, 51.0::numeric, 1.25::numeric, 5.0::numeric, 6.0::numeric),
  ('MCC 70', 'MMPC or MCC 70', 'as is', 69.5, 16.0, 2.50, 6.0, 8.0),
  ('MCC 80', 'MMPC or MCC 80', 'as is', 79.5, 10.0, 3.00, 6.0, 8.0),
  ('MCC 85', 'MMPC or MCC 85', 'dry basis', 85.0, 3.0, 3.00, 6.0, 8.0),
  ('MCI', 'MMPI or MCI', 'dry basis', 89.5, 1.0, 3.00, 7.0, 8.0)
) as g(code, label, protein_basis, protein, lactose, fat, moisture, ash)
cross join lateral (values
  ('protein', 'MIN', g.protein, 'SMEDP 15.132 (N x 6.38)'),
  ('lactose', 'MAX', g.lactose, 'SMEDP 15.092'),
  ('fat', 'MAX', g.fat, 'AOAC 989.05'),
  ('moisture', 'MAX', g.moisture, 'AOAC 927.05'),
  ('ash', 'MAX', g.ash, 'AOAC 900.02')
) as p(parameter, kind, v, method);

-- Methods for the MPC / MPI rows (0024) from the same standard's methods table.
update public.reference_material_specs s
set method = m.method
from (values
  ('protein', 'SMEDP 15.132 (N x 6.38)'),
  ('lactose', 'SMEDP 15.092'),
  ('fat', 'AOAC 989.05'),
  ('moisture', 'AOAC 927.05'),
  ('ash', 'AOAC 900.02')
) as m(parameter, method)
where s.parameter = m.parameter and s.method is null
  and s.source_url = 'https://adpi.org/wp-content/uploads/2023/10/Concentrated-Milk-Proteins-Standard-v2.1_2023.pdf';
