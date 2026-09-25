-- 0006 — run evidence is append-only for application users.
--
-- Raw process data (run_metrics) and imported file records (run_files) are audit
-- evidence: quality problems are handled later by a separate quarantine layer,
-- never by editing or deleting the source rows.
--
-- Before this migration ADMIN/ENGINEER/OPERATOR could UPDATE and DELETE both
-- tables through RLS, and deleting a run cascaded to its evidence.
--
-- Scope: anon and authenticated (every PostgREST caller). service_role and the
-- postgres owner keep full access for administrative maintenance; that path
-- bypasses RLS by design and is not reachable from the browser.

begin;

-- 1. RLS: no UPDATE/DELETE policies means no row is ever updatable or deletable.
drop policy if exists upd on public.run_metrics;
drop policy if exists del on public.run_metrics;
drop policy if exists upd on public.run_files;
drop policy if exists del on public.run_files;

-- 2. Table privileges: RLS does not apply to TRUNCATE, so remove the grants too.
revoke update, delete, truncate on public.run_metrics from anon, authenticated;
revoke update, delete, truncate on public.run_files from anon, authenticated;

-- 3. A run that has evidence can no longer be deleted (was ON DELETE CASCADE).
--    NO ACTION (checked at end of statement) keeps organization deletion working,
--    because that cascades to runs and evidence in the same statement.
alter table public.run_metrics
  drop constraint run_metrics_run_id_organization_id_fkey,
  add constraint run_metrics_run_id_organization_id_fkey
    foreign key (run_id, organization_id) references public.runs (id, organization_id)
    on delete no action;

alter table public.run_files
  drop constraint run_files_run_id_organization_id_fkey,
  add constraint run_files_run_id_organization_id_fkey
    foreign key (run_id, organization_id) references public.runs (id, organization_id)
    on delete no action;

-- 4. Deleting a file record must not silently rewrite metrics (was SET NULL (run_file_id)).
alter table public.run_metrics
  drop constraint run_metrics_run_file_id_organization_id_fkey,
  add constraint run_metrics_run_file_id_organization_id_fkey
    foreign key (run_file_id, organization_id) references public.run_files (id, organization_id)
    on delete no action;

commit;
