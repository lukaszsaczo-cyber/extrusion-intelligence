-- 0030: rennet casein, ADPI Edible Rennet Casein Standard v1.0 (effective 2024-02-22,
-- PDF read 2026-09-26). One composition column. Bases as the table states them: milk
-- protein "% w/w, dry basis"; moisture is total moisture (as for acid casein in 0024);
-- milkfat, ash and lactose give no basis, so it stays null. pH 6.5-7.5 is a MIN row and a
-- MAX row. Methods from the standard's "Methods of Analysis" table (pH has none).
-- Not stored: a casein share of milk protein (this standard has none; it is not taken
-- from another source), scorched particles, sensory and microbiology.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select 'Rennet casein', 'Edible Rennet Casein Standard v1.0', 'American Dairy Products Institute (ADPI)', x.parameter, x.unit, x.basis,
       x.kind::public.spec_kind, x.vmin, x.vmax, x.method,
       'https://adpi.org/wp-content/uploads/2024/02/Edible-Rennet-Casein-Standard-v1.0_2024.pdf', date '2026-09-26'
from (values
  ('milk protein', '%', 'dry basis', 'MIN', 84.0::numeric, null::numeric, 'AOAC 991.20 (N x 6.38)'),
  ('milkfat', '%', null, 'MAX', null, 2.0, 'AOAC 989.05'),
  ('moisture', '%', 'total', 'MAX', null, 12.0, 'AOAC 925.45'),
  ('ash', '%', null, 'MIN', 7.5, null, 'AOAC 942.05'),
  ('lactose', '%', null, 'MAX', null, 1.0, 'AOAC 984.15'),
  ('pH', '-', null, 'MIN', 6.5, null, null),
  ('pH', '-', null, 'MAX', null, 7.5, null)
) as x(parameter, unit, basis, kind, vmin, vmax, method);
