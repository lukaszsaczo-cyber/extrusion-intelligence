-- 0034: the permeate rows from 0027 named the document "Dairy (Milk & Whey) Permeate
-- Standard". The page heading reads "Dairy Permeate (Milk & Whey) Standard" (checked
-- 2026-09-26). Name only; no value changes.
update public.reference_material_specs
set product_name = replace(product_name, 'Dairy (Milk & Whey) Permeate Standard', 'Dairy Permeate (Milk & Whey) Standard')
where source_url = 'https://adpi.org/ingredient-resources/dairy-milk-permeate/'
  and product_name like 'Dairy (Milk & Whey) Permeate Standard%';
