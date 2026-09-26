-- 0028: dry buttermilk, ADPI Dry Buttermilk (DBM) Standard (PDF read 2026-09-26).
-- Two composition tables (Extra Grade, Standard Grade), each with a spray dried and an
-- atmospheric roller dried row. Stored: fat, moisture, protein (N x 6.38) and titratable
-- acidity (MIN and MAX). Basis is not stated, so it stays null. Titratable acidity has no
-- method in the standard's methods table, so method stays null.
-- Left out:
-- * Standard Grade fat: the table reads "Max. 4.5%", while Extra Grade reads "Min. 4.5%"
--   and the standard's own definition (and 21 CFR) requires not less than 4.5% milkfat.
--   Ambiguous, so not stored.
-- * Solubility index (ml) and scorched particles (mg, disc), microbiology and the optional
--   alkalinity of ash test: not composition.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select x.code, 'Dry Buttermilk (DBM) Standard (' || x.grade || ')', 'American Dairy Products Institute (ADPI)', x.parameter, '%', null,
       x.kind::public.spec_kind, x.vmin, x.vmax, x.method,
       'https://www.adpi.org/wp-content/uploads/2021/10/DryButtermilk_book.pdf', date '2026-09-26'
from (values
  ('Dry buttermilk (extra, spray)', 'Spray Dried Extra Grade DBM', 'fat', 'MIN', 4.5::numeric, null::numeric, 'AOAC 989.05'),
  ('Dry buttermilk (extra, spray)', 'Spray Dried Extra Grade DBM', 'moisture', 'MAX', null, 4.0, 'AOAC 925.45'),
  ('Dry buttermilk (extra, spray)', 'Spray Dried Extra Grade DBM', 'protein', 'MIN', 30.0, null, 'AOAC 991.20 (N x 6.38)'),
  ('Dry buttermilk (extra, spray)', 'Spray Dried Extra Grade DBM', 'titratable acidity', 'MIN', 0.10, null, null),
  ('Dry buttermilk (extra, spray)', 'Spray Dried Extra Grade DBM', 'titratable acidity', 'MAX', null, 0.18, null),
  ('Dry buttermilk (extra, roller)', 'Atmospheric Roller Dried Extra Grade DBM', 'fat', 'MIN', 4.5, null, 'AOAC 989.05'),
  ('Dry buttermilk (extra, roller)', 'Atmospheric Roller Dried Extra Grade DBM', 'moisture', 'MAX', null, 4.0, 'AOAC 925.45'),
  ('Dry buttermilk (extra, roller)', 'Atmospheric Roller Dried Extra Grade DBM', 'protein', 'MIN', 30.0, null, 'AOAC 991.20 (N x 6.38)'),
  ('Dry buttermilk (extra, roller)', 'Atmospheric Roller Dried Extra Grade DBM', 'titratable acidity', 'MIN', 0.10, null, null),
  ('Dry buttermilk (extra, roller)', 'Atmospheric Roller Dried Extra Grade DBM', 'titratable acidity', 'MAX', null, 0.18, null),
  ('Dry buttermilk (standard, spray)', 'Spray Dried Standard Grade DBM', 'moisture', 'MAX', null, 5.0, 'AOAC 925.45'),
  ('Dry buttermilk (standard, spray)', 'Spray Dried Standard Grade DBM', 'protein', 'MIN', 30.0, null, 'AOAC 991.20 (N x 6.38)'),
  ('Dry buttermilk (standard, spray)', 'Spray Dried Standard Grade DBM', 'titratable acidity', 'MIN', 0.10, null, null),
  ('Dry buttermilk (standard, spray)', 'Spray Dried Standard Grade DBM', 'titratable acidity', 'MAX', null, 0.20, null),
  ('Dry buttermilk (standard, roller)', 'Atmospheric Roller Dried Standard Grade DBM', 'moisture', 'MAX', null, 5.0, 'AOAC 925.45'),
  ('Dry buttermilk (standard, roller)', 'Atmospheric Roller Dried Standard Grade DBM', 'protein', 'MIN', 30.0, null, 'AOAC 991.20 (N x 6.38)'),
  ('Dry buttermilk (standard, roller)', 'Atmospheric Roller Dried Standard Grade DBM', 'titratable acidity', 'MIN', 0.10, null, null),
  ('Dry buttermilk (standard, roller)', 'Atmospheric Roller Dried Standard Grade DBM', 'titratable acidity', 'MAX', null, 0.20, null)
) as x(code, grade, parameter, kind, vmin, vmax, method);
