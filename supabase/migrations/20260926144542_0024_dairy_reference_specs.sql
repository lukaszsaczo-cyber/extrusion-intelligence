-- 0024: dairy raw materials in the reference catalog, quoted from ADPI standards
-- (read 2026-09-26). Only values that the source assigns unambiguously to one
-- product are included; a value whose column could not be told apart is left out.
-- Specifications, never lot measurements.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on) values
  -- Skim Milk Powder Standard v3.0
  ('SMP', 'Skim Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'protein', '%', 'solids non-fat', 'MIN', 34.0, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  ('SMP', 'Skim Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'fat', '%', null, 'MAX', null, 1.50, null, 'https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  ('SMP', 'Skim Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'moisture', '%', null, 'MAX', null, 5.0, null, 'https://adpi.org/wp-content/uploads/2023/07/Skim-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  -- Whole Milk Powder Standard v3.0
  ('WMP', 'Whole Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'protein', '%', 'solids non-fat', 'MIN', 34.0, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  ('WMP', 'Whole Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'fat', '%', null, 'MIN', 26.0, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  ('WMP', 'Whole Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'fat', '%', null, 'MAX', null, 42.0, null, 'https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  ('WMP', 'Whole Milk Powder Standard v3.0', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'excl. lactose water of crystallization', 'MAX', null, 4.5, null, 'https://adpi.org/wp-content/uploads/2023/07/Whole-Milk-Powder-Standard-v3.0_2023.pdf', '2026-09-26'),
  -- Whey Protein Concentrate Standard v4.0, WPC 34 (as-is basis)
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'protein', '%', 'as is', 'MIN', 33.5, null, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'protein', '%', 'as is', 'TYPICAL_RANGE', 34.0, 36.0, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'lactose', '%', 'as is', 'TYPICAL_RANGE', 48.0, 55.0, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'fat', '%', 'as is', 'MAX', null, 5.0, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'fat', '%', 'as is', 'TYPICAL_RANGE', 3.0, 4.5, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'total', 'MAX', null, 6.0, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'total', 'TYPICAL_RANGE', 3.0, 5.0, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  ('WPC 34', 'Whey Protein Concentrate Standard v4.0 (WPC 34)', 'American Dairy Products Institute (ADPI)', 'ash', '%', 'as is', 'TYPICAL_RANGE', 6.5, 8.0, null, 'https://adpi.org/ingredient-resources/whey-protein-concentrate/', '2026-09-26'),
  -- Dry Whey Standard v4
  ('Sweet whey powder', 'Dry Whey Standard v4 (dry sweet whey)', 'American Dairy Products Institute (ADPI)', 'protein', '%', null, 'MIN', 11, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Sweet whey powder', 'Dry Whey Standard v4 (dry sweet whey)', 'American Dairy Products Institute (ADPI)', 'moisture', '%', null, 'MAX', null, 5.0, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Sweet whey powder', 'Dry Whey Standard v4 (dry sweet whey)', 'American Dairy Products Institute (ADPI)', 'lactose', '%', null, 'MIN', 65, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Sweet whey powder', 'Dry Whey Standard v4 (dry sweet whey)', 'American Dairy Products Institute (ADPI)', 'ash', '%', null, 'MAX', null, 8.5, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Sweet whey powder', 'Dry Whey Standard v4 (dry sweet whey)', 'American Dairy Products Institute (ADPI)', 'titratable acidity', '%', null, 'MAX', null, 0.16, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Acid whey powder', 'Dry Whey Standard v4 (dry acid whey)', 'American Dairy Products Institute (ADPI)', 'protein', '%', null, 'MIN', 7, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Acid whey powder', 'Dry Whey Standard v4 (dry acid whey)', 'American Dairy Products Institute (ADPI)', 'moisture', '%', null, 'MAX', null, 4.5, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Acid whey powder', 'Dry Whey Standard v4 (dry acid whey)', 'American Dairy Products Institute (ADPI)', 'ash', '%', null, 'MAX', null, 15.0, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  ('Acid whey powder', 'Dry Whey Standard v4 (dry acid whey)', 'American Dairy Products Institute (ADPI)', 'titratable acidity', '%', null, 'MIN', 0.35, null, null, 'https://adpi.org/wp-content/uploads/2023/07/Dry-Whey-Standard-v4_2023.pdf', '2026-09-26'),
  -- Edible Caseinates Standard v1.0
  ('Caseinate', 'Edible Caseinates Standard v1.0', 'American Dairy Products Institute (ADPI)', 'milk protein', '%', 'dry basis', 'MIN', 90.0, null, null, 'https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', '2026-09-26'),
  ('Caseinate', 'Edible Caseinates Standard v1.0', 'American Dairy Products Institute (ADPI)', 'milkfat', '%', null, 'MAX', null, 2.0, null, 'https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', '2026-09-26'),
  ('Caseinate', 'Edible Caseinates Standard v1.0', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'total', 'MAX', null, 6.0, null, 'https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', '2026-09-26'),
  ('Caseinate', 'Edible Caseinates Standard v1.0', 'American Dairy Products Institute (ADPI)', 'lactose', '%', null, 'MAX', null, 1.0, null, 'https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', '2026-09-26'),
  ('Caseinate', 'Edible Caseinates Standard v1.0', 'American Dairy Products Institute (ADPI)', 'pH', '-', null, 'MAX', null, 8.0, null, 'https://adpi.org/wp-content/uploads/2024/02/Edible-Caseinates-Standard-v1.0_2024.pdf', '2026-09-26'),
  -- Edible Acid Casein
  ('Acid casein', 'Edible Acid Casein Standard', 'American Dairy Products Institute (ADPI)', 'milk protein', '%', 'dry basis', 'MIN', 90.0, null, null, 'https://adpi.org/ingredient-resources/edible-acid-casein/', '2026-09-26'),
  ('Acid casein', 'Edible Acid Casein Standard', 'American Dairy Products Institute (ADPI)', 'casein share of milk protein', '%', 'dry basis', 'MIN', 95.0, null, null, 'https://adpi.org/ingredient-resources/edible-acid-casein/', '2026-09-26'),
  ('Acid casein', 'Edible Acid Casein Standard', 'American Dairy Products Institute (ADPI)', 'milkfat', '%', null, 'MAX', null, 2.0, null, 'https://adpi.org/ingredient-resources/edible-acid-casein/', '2026-09-26'),
  ('Acid casein', 'Edible Acid Casein Standard', 'American Dairy Products Institute (ADPI)', 'moisture', '%', 'total', 'MAX', null, 12.0, null, 'https://adpi.org/ingredient-resources/edible-acid-casein/', '2026-09-26'),
  ('Acid casein', 'Edible Acid Casein Standard', 'American Dairy Products Institute (ADPI)', 'ash (phosphated)', '%', null, 'MAX', null, 2.5, null, 'https://adpi.org/ingredient-resources/edible-acid-casein/', '2026-09-26'),
  ('Acid casein', 'Edible Acid Casein Standard', 'American Dairy Products Institute (ADPI)', 'lactose', '%', null, 'MAX', null, 1.0, null, 'https://adpi.org/ingredient-resources/edible-acid-casein/', '2026-09-26');

-- Concentrated Milk Proteins Standard v2.1, first table (MPC 40 ... MPI):
-- protein limits are minima, all other limits are maxima.
insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select m.code, 'Concentrated Milk Proteins Standard v2.1 (' || m.code || ')', 'American Dairy Products Institute (ADPI)', p.parameter, '%',
       case when p.parameter = 'protein' then 'see standard, footnote 1' when p.parameter = 'moisture' then 'total' end,
       case when p.parameter = 'protein' then 'MIN' else 'MAX' end::public.spec_kind,
       case when p.parameter = 'protein' then p.v end, case when p.parameter = 'protein' then null else p.v end,
       null, 'https://adpi.org/wp-content/uploads/2023/10/Concentrated-Milk-Proteins-Standard-v2.1_2023.pdf', date '2026-09-26'
from (values ('MPC 40', 39.5, 52.0, 1.25, 5.0, 10.0), ('MPC 42', 41.5, 51.0, 1.25, 5.0, 10.0), ('MPC 56', 55.5, 36.0, 1.50, 5.0, 10.0),
             ('MPC 70', 69.5, 20.0, 2.50, 6.0, 10.0), ('MPC 80', 79.5, 9.0, 2.50, 6.0, 8.0), ('MPC 85', 85.0, 8.0, 2.50, 6.0, 8.0),
             ('MPI', 89.5, 5.0, 2.50, 6.0, 8.0)) as m(code, protein, lactose, fat, moisture, ash)
cross join lateral (values ('protein', m.protein), ('lactose', m.lactose), ('fat', m.fat), ('moisture', m.moisture), ('ash', m.ash)) as p(parameter, v);
