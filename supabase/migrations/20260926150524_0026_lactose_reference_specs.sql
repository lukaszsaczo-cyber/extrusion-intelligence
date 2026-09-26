-- 0026: lactose, ADPI Lactose Standard v4 (PDF read 2026-09-26). Composition table with
-- three grade columns (Industrial/Fermentation, Edible (Food Grade), Refined Edible):
-- lactose, protein and ash on dry basis, total moisture as is incl. water of
-- crystallization. Methods from the "Methods of Analysis" table of the same standard
-- on the ADPI lactose page. Left out: the physico-chemical table (pH 4.5-7.5, scorched
-- particles), because it has one limits column and does not say which grades it covers.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select g.code, 'Lactose Standard v4 (' || g.grade || ')', 'American Dairy Products Institute (ADPI)', p.parameter, '%', p.basis,
       p.kind::public.spec_kind,
       case when p.kind = 'MIN' then p.v end, case when p.kind = 'MAX' then p.v end,
       p.method, 'https://adpi.org/wp-content/uploads/2023/06/Lactose-Standard-v4._2023.pdf', date '2026-09-26'
from (values
  ('Lactose (edible)', 'Edible (Food Grade) Lactose', 99.0, 0.30, 0.30, 6.0),
  ('Lactose (refined edible)', 'Refined Edible Grade Lactose', 99.50, 0.15, 0.20, 6.0),
  ('Lactose (industrial)', 'Industrial / Fermentation Grade Lactose', 98.0, 1.0, 0.45, 6.0)
) as g(code, grade, lactose, protein, ash, moisture)
cross join lateral (values
  ('lactose', 'dry basis', 'MIN', g.lactose, 'ISO 22662 / IDF 198'),
  ('protein', 'dry basis', 'MAX', g.protein, 'AOAC 991.20 (N x 6.38)'),
  ('ash (phosphated)', 'dry basis', 'MAX', g.ash, 'AOAC 942.05'),
  ('moisture', 'as is, incl. water of crystallization', 'MAX', g.moisture, 'ISO 5537 / IDF 26')
) as p(parameter, basis, kind, v, method);
