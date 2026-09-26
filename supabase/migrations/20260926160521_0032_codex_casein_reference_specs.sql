-- 0032: Codex CXS 290-1995 Standard for Edible Casein Products (adopted 1995, revised
-- 2001, amended up to 2023; PDF read 2026-09-26), section 3.3 Composition. A second
-- source next to the ADPI rows, under its own codes, never merged with them.
-- Footnotes carried into the rows:
-- (a) protein = 6.38 x total Kjeldahl nitrogen, "in dry matter";
-- (b) water does not include water of crystallization of the lactose;
-- (c) lactose expressed as anhydrous lactose.
-- Ash includes P2O5: a minimum for rennet casein, a maximum for acid casein, none for
-- caseinates. Not stored: the appendix (sediment, heavy metals, appearance, flavour),
-- which the standard itself marks as additional information.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select x.code, 'CXS 290-1995 Standard for Edible Casein Products (' || x.label || ')', 'Codex Alimentarius (FAO/WHO)',
       x.parameter, x.unit, x.basis, x.kind::public.spec_kind, x.vmin, x.vmax, x.method,
       'https://www.fao.org/fao-who-codexalimentarius/sh-proxy/jp/?lnk=1&url=https%253A%252F%252Fworkspace.fao.org%252Fsites%252Fcodex%252FStandards%252FCXS%2B290-1995%252FCXS_290e.pdf',
       date '2026-09-26'
from (values
  ('Rennet casein (Codex)', 'Rennet casein', 'milk protein', '%', 'dry basis', 'MIN', 84.0::numeric, null::numeric, 'N x 6.38 (total Kjeldahl nitrogen)'),
  ('Rennet casein (Codex)', 'Rennet casein', 'casein share of milk protein', '%', null, 'MIN', 95.0, null, null),
  ('Rennet casein (Codex)', 'Rennet casein', 'moisture', '%', 'excl. lactose water of crystallization', 'MAX', null, 12.0, null),
  ('Rennet casein (Codex)', 'Rennet casein', 'milkfat', '%', null, 'MAX', null, 2.0, null),
  ('Rennet casein (Codex)', 'Rennet casein', 'ash (incl. P2O5)', '%', null, 'MIN', 7.5, null, null),
  ('Rennet casein (Codex)', 'Rennet casein', 'lactose', '%', 'as anhydrous lactose', 'MAX', null, 1.0, null),
  ('Acid casein (Codex)', 'Acid casein', 'milk protein', '%', 'dry basis', 'MIN', 90.0, null, 'N x 6.38 (total Kjeldahl nitrogen)'),
  ('Acid casein (Codex)', 'Acid casein', 'casein share of milk protein', '%', null, 'MIN', 95.0, null, null),
  ('Acid casein (Codex)', 'Acid casein', 'moisture', '%', 'excl. lactose water of crystallization', 'MAX', null, 12.0, null),
  ('Acid casein (Codex)', 'Acid casein', 'milkfat', '%', null, 'MAX', null, 2.0, null),
  ('Acid casein (Codex)', 'Acid casein', 'ash (incl. P2O5)', '%', null, 'MAX', null, 2.5, null),
  ('Acid casein (Codex)', 'Acid casein', 'lactose', '%', 'as anhydrous lactose', 'MAX', null, 1.0, null),
  ('Acid casein (Codex)', 'Acid casein', 'free acid', 'mL 0.1 N NaOH/g', null, 'MAX', null, 0.27, null),
  ('Caseinate (Codex)', 'Caseinates', 'milk protein', '%', 'dry basis', 'MIN', 88.0, null, 'N x 6.38 (total Kjeldahl nitrogen)'),
  ('Caseinate (Codex)', 'Caseinates', 'casein share of milk protein', '%', null, 'MIN', 95.0, null, null),
  ('Caseinate (Codex)', 'Caseinates', 'moisture', '%', 'excl. lactose water of crystallization', 'MAX', null, 8.0, null),
  ('Caseinate (Codex)', 'Caseinates', 'milkfat', '%', null, 'MAX', null, 2.0, null),
  ('Caseinate (Codex)', 'Caseinates', 'lactose', '%', 'as anhydrous lactose', 'MAX', null, 1.0, null),
  ('Caseinate (Codex)', 'Caseinates', 'pH', '-', null, 'MAX', null, 8.0, null)
) as x(code, label, parameter, unit, basis, kind, vmin, vmax, method);
