-- 0033: completing the ADPI rows from 0023/0024 against their own documents (read again
-- 2026-09-26). Only the "Methods of Analysis" table and composition table of the same
-- document are used; nothing comes from another source.
--
-- * Methods filled in where the document's methods table names the parameter:
--   Edible Acid Casein page, Edible Caseinates Standard v1.0, SMP and WMP Standards v3.0,
--   WPI Standard v4.0. Parameters without a listed method stay null.
--   SMP/WMP protein: both PDFs print "ISO 8698-1/IDF20part1". IDF 20-1 is ISO 8968-1
--   (milk, nitrogen by Kjeldahl); the digits are transposed in the source, so the row
--   stores ISO 8968-1 / IDF 20-1.
-- * Acid casein: titratable acidity 0.27 maximum (mL 0.1 N NaOH/g) was in the page's
--   composition table but not stored in 0024.
-- * SMP: moisture basis. The standard's footnote 2 says moisture does not include lactose
--   water of crystallization (the WMP row already says so; the SMP row had null).
-- * WPI 90 (ADPI): lactose, fat and ash from the same composition table were not stored
--   in 0023. Only protein has a stated basis (dry basis); these three stay null.
-- Not changed: the sweet and acid whey rows. Their values come from the Codex table
-- reproduced in the ADPI Dry Whey Standard (table_origin), while the methods table in that
-- document belongs to the ADPI requirements; applying it to the Codex values would mix
-- sources.

update public.reference_material_specs s
set method = m.method
from (values
  ('https://adpi.org/ingredient-resources/edible-acid-casein/', 'milk protein', 'AOAC 991.20 (N x 6.38)'),
  ('https://adpi.org/ingredient-resources/edible-acid-casein/', 'milkfat', 'AOAC 989.05'),
  ('https://adpi.org/ingredient-resources/edible-acid-casein/', 'moisture', 'AOAC 925.45'),
  ('https://adpi.org/ingredient-resources/edible-acid-casein/', 'ash (phosphated)', 'AOAC 942.05'),
  ('https://adpi.org/ingredient-resources/edible-acid-casein/', 'lactose', 'AOAC 984.15'),
  ('https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', 'milk protein', 'AOAC 991.20 (N x 6.38)'),
  ('https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', 'milkfat', 'AOAC 989.05'),
  ('https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', 'moisture', 'AOAC 925.45'),
  ('https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', 'lactose', 'AOAC 984.15'),
  ('https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', 'pH', 'USDA'),
  ('https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf', 'protein', 'ISO 8968-1 / IDF 20-1'),
  ('https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf', 'fat', 'ISO 1736 / IDF 9C'),
  ('https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf', 'moisture', 'ISO 5537 / IDF 26'),
  ('https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', 'protein', 'ISO 8968-1 / IDF 20-1'),
  ('https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', 'fat', 'ISO 1736 / IDF 9C'),
  ('https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', 'moisture', 'ISO 5537 / IDF 26'),
  ('https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', 'protein', 'AOAC 991.20 (N x 6.38)'),
  ('https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', 'moisture', 'AOAC 925.45')
) as m(url, parameter, method)
where s.source_url = m.url and s.parameter = m.parameter and s.method is null;

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select 'Acid casein', a.product_name, a.source_org, 'titratable acidity', 'mL 0.1 N NaOH/g', null, 'MAX'::public.spec_kind, null, 0.27, 'SMEDP',
       'https://adpi.org/ingredient-resources/edible-acid-casein/', date '2026-09-26'
from (select product_name, source_org from public.reference_material_specs
      where code = 'Acid casein' and source_url = 'https://adpi.org/ingredient-resources/edible-acid-casein/' limit 1) a;

update public.reference_material_specs
set basis = 'excl. lactose water of crystallization'
where code = 'SMP' and parameter = 'moisture' and basis is null
  and source_url = 'https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf';

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select 'WPI 90', w.product_name, w.source_org, x.parameter, '%', null, x.kind::public.spec_kind, x.vmin, x.vmax, x.method,
       'https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf', date '2026-09-26'
from (select product_name, source_org from public.reference_material_specs
      where code = 'WPI 90' and source_url = 'https://adpi.org/wp-content/uploads/2023/07/WPI-Standard-v4.0_2023.pdf' limit 1) w
cross join (values
  ('lactose', 'TYPICAL_RANGE', 0.5::numeric, 1.0::numeric, 'ISO 22662 / IDF 198'),
  ('fat', 'TYPICAL_RANGE', 0.5, 1.0, 'AOAC 989.05'),
  ('fat', 'MAX', null, 1.5, 'AOAC 989.05'),
  ('ash', 'TYPICAL_RANGE', 2.0, 3.0, 'AOAC 942.05')
) as x(parameter, kind, vmin, vmax, method);
