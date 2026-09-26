-- 0029: demineralized (reduced minerals) whey. ADPI's Dry Whey page has no table for it,
-- so two other sources, each kept under its own code:
-- 1. 21 CFR 184.1979b (eCFR, up to date as of 2026-09-24): specification limits "on a dry
--    product basis". That wording covers the powder itself (moisture 1-6 % is in the same
--    list), so basis keeps the source's words and is not "dry basis". Ranges are stored as
--    a MIN row and a MAX row. Methods: AOAC OMA 13th ed. (1980), dry-sample sections.
--    Left out: solids and titratable acidity ("variable"), heavy metals (ppm).
-- 2. USDEC ThinkUSAdairy "Demineralized Whey": typical composition, basis not stated.
--    The page says it is for general information only. Left out: microbiology, scorched
--    particles, color, flavor.
-- The sources disagree on fat (CFR 1-4 %, USDEC typical 0.5-1.8 %); both are stored as
-- written, each with its own source. No values per demineralization level (25/50/90 %)
-- are stored: neither source gives them.

insert into public.reference_material_specs (code, product_name, source_org, parameter, unit, basis, kind, value_min, value_max, method, source_url, retrieved_on)
select x.code, x.product, x.org, x.parameter, x.unit, x.basis, x.kind::public.spec_kind, x.vmin, x.vmax, x.method, x.url, date '2026-09-26'
from (values
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'protein', '%', 'dry product basis', 'MIN', 10::numeric, null::numeric, 'AOAC OMA 13th ed. 16.193 (Kjeldahl)', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'protein', '%', 'dry product basis', 'MAX', null, 24, 'AOAC OMA 13th ed. 16.193 (Kjeldahl)', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'fat', '%', 'dry product basis', 'MIN', 1, null, 'AOAC OMA 13th ed. 16.199', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'fat', '%', 'dry product basis', 'MAX', null, 4, 'AOAC OMA 13th ed. 16.199', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'ash', '%', 'dry product basis', 'MAX', null, 7, 'AOAC OMA 13th ed. 16.196', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'lactose', '%', 'dry product basis', 'MAX', null, 85, 'AOAC OMA 13th ed. 31.061 (Lane-Eynon)', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'moisture', '%', 'dry product basis', 'MIN', 1, null, 'AOAC OMA 13th ed. 16.192', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (21 CFR)', '21 CFR 184.1979b Reduced minerals whey', 'U.S. FDA (21 CFR, eCFR)', 'moisture', '%', 'dry product basis', 'MAX', null, 6, 'AOAC OMA 13th ed. 16.192', 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-184/subpart-B/section-184.1979b'),
  ('Demineralized whey (USDEC typical)', 'Demineralized Whey, typical composition', 'U.S. Dairy Export Council (ThinkUSAdairy)', 'protein', '%', null, 'TYPICAL_RANGE', 11.0, 15.0, null, 'https://www.thinkusadairy.org/products/whey-protein-and-ingredients/whey-categories/demineralized-whey'),
  ('Demineralized whey (USDEC typical)', 'Demineralized Whey, typical composition', 'U.S. Dairy Export Council (ThinkUSAdairy)', 'lactose', '%', null, 'TYPICAL_RANGE', 70.0, 80.0, null, 'https://www.thinkusadairy.org/products/whey-protein-and-ingredients/whey-categories/demineralized-whey'),
  ('Demineralized whey (USDEC typical)', 'Demineralized Whey, typical composition', 'U.S. Dairy Export Council (ThinkUSAdairy)', 'fat', '%', null, 'TYPICAL_RANGE', 0.5, 1.8, null, 'https://www.thinkusadairy.org/products/whey-protein-and-ingredients/whey-categories/demineralized-whey'),
  ('Demineralized whey (USDEC typical)', 'Demineralized Whey, typical composition', 'U.S. Dairy Export Council (ThinkUSAdairy)', 'ash', '%', null, 'TYPICAL_RANGE', 1.0, 7.0, null, 'https://www.thinkusadairy.org/products/whey-protein-and-ingredients/whey-categories/demineralized-whey'),
  ('Demineralized whey (USDEC typical)', 'Demineralized Whey, typical composition', 'U.S. Dairy Export Council (ThinkUSAdairy)', 'moisture', '%', null, 'TYPICAL_RANGE', 3.0, 4.0, null, 'https://www.thinkusadairy.org/products/whey-protein-and-ingredients/whey-categories/demineralized-whey'),
  ('Demineralized whey (USDEC typical)', 'Demineralized Whey, typical composition', 'U.S. Dairy Export Council (ThinkUSAdairy)', 'pH', 'pH', null, 'TYPICAL_RANGE', 6.2, 7.0, null, 'https://www.thinkusadairy.org/products/whey-protein-and-ingredients/whey-categories/demineralized-whey')
) as x(code, product, org, parameter, unit, basis, kind, vmin, vmax, method, url);
