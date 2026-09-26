-- 0027: dairy permeate, ADPI "Dairy (Milk & Whey) Permeate" page (HTML read 2026-09-26).
-- Composition table with two products (Milk Permeate, Whey Permeate), each with a
-- "typical" column and a "limit" column. Both are stored: the limit as MIN/MAX, the
-- typical column as TYPICAL_RANGE. The table gives the unit as "%" and does not state a
-- basis, so basis stays null. Whey permeate fat limit reads "1.5. maximum" in the source
-- (a stray full stop); the value 1.5 maximum is unambiguous. Methods from the "Methods of
-- Analysis" table on the same page. Left out: the physico-chemical table (scorched
-- particles 15 maximum, pH 5.5-6.6), because it has one column and does not say which of
-- the two products it covers.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select g.code, 'Dairy (Milk & Whey) Permeate Standard (' || g.grade || ')', 'American Dairy Products Institute (ADPI)', p.parameter, '%', null,
       p.kind::public.spec_kind, p.vmin, p.vmax, p.method,
       'https://adpi.org/ingredient-resources/dairy-milk-permeate/', date '2026-09-26'
from (values ('Milk permeate', 'Milk Permeate'), ('Whey permeate', 'Whey Permeate')) as g(code, grade)
cross join lateral (
  select * from (values
    -- milk permeate
    ('Milk permeate', 'lactose', 'TYPICAL_RANGE', 78::numeric, 88::numeric, 'ISO 22662 / IDF 198'),
    ('Milk permeate', 'lactose', 'MIN', 76, null, 'ISO 22662 / IDF 198'),
    ('Milk permeate', 'protein', 'TYPICAL_RANGE', 3, 5, 'AOAC 991.20 (N x 6.38)'),
    ('Milk permeate', 'protein', 'MIN', 2, null, 'AOAC 991.20 (N x 6.38)'),
    ('Milk permeate', 'fat', 'TYPICAL_RANGE', 0, 1.0, 'AOAC 989.05'),
    ('Milk permeate', 'fat', 'MAX', null, 1.5, 'AOAC 989.05'),
    ('Milk permeate', 'ash (phosphated)', 'TYPICAL_RANGE', 8, 11, 'AOAC 942.05'),
    ('Milk permeate', 'ash (phosphated)', 'MAX', null, 14, 'AOAC 942.05'),
    ('Milk permeate', 'moisture', 'TYPICAL_RANGE', 3, 4.5, 'AOAC 925.45'),
    ('Milk permeate', 'moisture', 'MAX', null, 5.0, 'AOAC 925.45'),
    -- whey permeate
    ('Whey permeate', 'lactose', 'TYPICAL_RANGE', 76, 85, 'ISO 22662 / IDF 198'),
    ('Whey permeate', 'lactose', 'MIN', 76, null, 'ISO 22662 / IDF 198'),
    ('Whey permeate', 'protein', 'TYPICAL_RANGE', 2, 7, 'AOAC 991.20 (N x 6.38)'),
    ('Whey permeate', 'protein', 'MAX', null, 7, 'AOAC 991.20 (N x 6.38)'),
    ('Whey permeate', 'fat', 'TYPICAL_RANGE', 0, 1.0, 'AOAC 989.05'),
    ('Whey permeate', 'fat', 'MAX', null, 1.5, 'AOAC 989.05'),
    ('Whey permeate', 'ash (phosphated)', 'TYPICAL_RANGE', 8, 11, 'AOAC 942.05'),
    ('Whey permeate', 'ash (phosphated)', 'MAX', null, 14, 'AOAC 942.05'),
    ('Whey permeate', 'moisture', 'TYPICAL_RANGE', 3, 4.5, 'AOAC 925.45'),
    ('Whey permeate', 'moisture', 'MAX', null, 5.0, 'AOAC 925.45')
  ) as x(code, parameter, kind, vmin, vmax, method)
  where x.code = g.code
) as p;
