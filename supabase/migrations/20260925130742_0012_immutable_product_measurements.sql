-- 0012 — product measurements are append-only for application users.
--
-- Lab/product measurements are the "results" a diagnosis is judged against, so
-- they are audit evidence like run_metrics (0006): a wrong value is corrected by
-- recording a new measurement, never by editing or deleting the old one.
--
-- Before this migration ADMIN/ENGINEER/OPERATOR could UPDATE and DELETE rows
-- through RLS, authenticated had TRUNCATE, and deleting a product sample
-- cascaded to its measurements. The table was empty when this was written.
--
-- Scope and exceptions match 0006: anon and authenticated lose UPDATE/DELETE/
-- TRUNCATE; service_role and the owner keep administrative access. Deleting an
-- organization still cascades (same statement), and deleting an auth user still
-- sets created_by to NULL, as for run evidence.
--
-- Applied to production 2026-09-25 as version 20260925130742.

-- 1. RLS: no UPDATE/DELETE policies means no row is ever updatable or deletable.
drop policy if exists upd on public.product_measurements;
drop policy if exists del on public.product_measurements;

-- 2. Table privileges: RLS does not apply to TRUNCATE, so remove the grants too.
revoke update, delete, truncate on public.product_measurements from anon, authenticated;

-- 3. A product sample that has measurements can no longer be deleted (was CASCADE).
alter table public.product_measurements
  drop constraint product_measurements_product_sample_id_organization_id_fkey,
  add constraint product_measurements_product_sample_id_organization_id_fkey
    foreign key (product_sample_id, organization_id) references public.product_samples (id, organization_id)
    on delete no action;
