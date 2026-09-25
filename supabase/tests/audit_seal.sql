-- Stage 7 database guarantees for the audit (migration 0013): only ADMIN and
-- ENGINEER seal, the snapshot is built by the database, the chain links every
-- record to the one before, integrity detects an edited record and an edit
-- re-hashed to hide itself, nobody else's organization is visible, records
-- cannot be changed and client roles cannot TRUNCATE.
-- Always ends in RAISE, so nothing persists. Result: 'AUDIT_SEAL_RESULT {json}'.
do $test$
declare
  u_eng uuid := gen_random_uuid(); u_op uuid := gen_random_uuid(); u_view uuid := gen_random_uuid(); u_other uuid := gen_random_uuid();
  org uuid; org2 uuid; site uuid; machine uuid; recipe uuid; rv uuid; plan uuid; run uuid;
  a1 uuid; a2 uuid; a3 uuid; r record; snap jsonb; n bigint; checks int := 0;
  expected_keys text[] := array['diagnoses','files','measurements','plan','predictions','previous_hash','quality',
                                'run','schema','sealed_at','sealed_by','seq','state_snapshots','verifications'];
  failures jsonb := '[]'::jsonb;
begin
  insert into auth.users (id, aud, role, email) values
    (u_eng, 'authenticated', 'authenticated', 'as-eng-' || u_eng || '@test.invalid'),
    (u_op, 'authenticated', 'authenticated', 'as-op-' || u_op || '@test.invalid'),
    (u_view, 'authenticated', 'authenticated', 'as-view-' || u_view || '@test.invalid'),
    (u_other, 'authenticated', 'authenticated', 'as-other-' || u_other || '@test.invalid');
  insert into public.organizations (name) values ('Audit test') returning id into org;
  insert into public.organizations (name) values ('Audit test other') returning id into org2;
  insert into public.organization_members (organization_id, user_id, role) values
    (org, u_eng, 'ENGINEER'), (org, u_op, 'OPERATOR'), (org, u_view, 'VIEWER'), (org2, u_other, 'ADMIN');
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into machine;
  insert into public.recipes (organization_id, name) values (org, 'r') returning id into recipe;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, recipe, 1) returning id into rv;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, screw_rpm) values (org, rv, machine, 300) returning id into plan;
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, machine, plan, 'A-1') returning id into run;

  -- ------------------------------------------------ OPERATOR and VIEWER cannot seal
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    perform public.seal_run_audit(run);
    failures := failures || jsonb_build_object('check', 'operator cannot seal', 'detail', 'accepted');
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'operator cannot seal', 'sqlstate', sqlstate); end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_view, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    perform public.seal_run_audit(run);
    failures := failures || jsonb_build_object('check', 'viewer cannot seal', 'detail', 'accepted');
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'viewer cannot seal', 'sqlstate', sqlstate); end if;
  end;
  reset role;

  -- ------------------------------------------------ another organization's ADMIN
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    perform public.seal_run_audit(run);
    failures := failures || jsonb_build_object('check', 'other org cannot seal', 'detail', 'accepted');
  exception when others then
    if sqlstate not in ('42501', 'P0002') then failures := failures || jsonb_build_object('check', 'other org cannot seal', 'sqlstate', sqlstate); end if;
  end;
  reset role;

  -- ------------------------------------------------ ENGINEER seals twice
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  a1 := public.seal_run_audit(run);
  a2 := public.seal_run_audit(run);
  select snapshot into snap from public.audit_records where id = a1;
  checks := checks + 1;
  if (select array_agg(k order by k) from jsonb_object_keys(snap) k) <> expected_keys then
    failures := failures || jsonb_build_object('check', 'snapshot has exactly the audit-v1 keys', 'keys', (select jsonb_agg(k) from jsonb_object_keys(snap) k));
  end if;
  checks := checks + 1;
  if not (snap ->> 'seq' = '1' and snap -> 'previous_hash' = 'null'::jsonb and snap ->> 'sealed_by' = u_eng::text
          and snap #>> '{run,run_code}' = 'A-1' and snap #>> '{plan,screw_rpm}' = '300') then
    failures := failures || jsonb_build_object('check', 'first record content', 'snapshot', snap);
  end if;
  checks := checks + 1;
  if (select snapshot ->> 'previous_hash' from public.audit_records where id = a2)
     is distinct from (select final_hash from public.audit_records where id = a1) then
    failures := failures || jsonb_build_object('check', 'second record links to the first', 'detail', 'no link');
  end if;
  checks := checks + 1;
  select count(*) into n from public.audit_integrity(org) i where i.hash_ok and i.chain_ok;
  if n <> 2 then failures := failures || jsonb_build_object('check', 'intact chain verifies', 'ok_rows', n); end if;

  checks := checks + 1;  -- an app user cannot write a record directly (no insert policy)
  begin
    insert into public.audit_records (organization_id, run_id, snapshot, final_hash) values (org, run, '{}'::jsonb, repeat('0', 64));
    failures := failures || jsonb_build_object('check', 'direct insert refused', 'detail', 'accepted');
  exception when others then null; end;

  checks := checks + 1;  -- client roles cannot truncate (would bypass the row trigger)
  begin
    truncate public.audit_records;
    failures := failures || jsonb_build_object('check', 'truncate refused', 'detail', 'accepted');
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'truncate refused', 'sqlstate', sqlstate); end if;
  end;
  reset role;

  -- ------------------------------------------------ other org sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.audit_records where organization_id = org;
  if n <> 0 then failures := failures || jsonb_build_object('check', 'other org sees no records', 'rows', n); end if;
  checks := checks + 1;
  select count(*) into n from public.audit_integrity(org);
  if n <> 0 then failures := failures || jsonb_build_object('check', 'other org gets no integrity rows', 'rows', n); end if;
  reset role;

  -- ------------------------------------------------ records are immutable, even for the owner role
  checks := checks + 1;
  begin
    update public.audit_records set final_hash = repeat('0', 64) where id = a1;
    failures := failures || jsonb_build_object('check', 'update refused', 'detail', 'accepted');
  exception when others then null; end;
  checks := checks + 1;
  begin
    delete from public.audit_records where id = a1;
    failures := failures || jsonb_build_object('check', 'delete refused', 'detail', 'accepted');
  exception when others then null; end;

  -- ------------------------------------------------ tamper detection (trigger off only inside this rolled-back test)
  alter table public.audit_records disable trigger audit_immutable;
  update public.audit_records set snapshot = jsonb_set(snapshot, '{plan,screw_rpm}', '999') where id = a1;
  checks := checks + 1;
  select * into r from public.audit_integrity(org) i where i.id = a1;
  if r.hash_ok then failures := failures || jsonb_build_object('check', 'edited snapshot detected', 'detail', 'hash still ok'); end if;

  -- hide the edit by re-hashing: the next record's link now breaks
  update public.audit_records set final_hash = encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex') where id = a1;
  checks := checks + 1;
  select * into r from public.audit_integrity(org) i where i.id = a2;
  if r.chain_ok then failures := failures || jsonb_build_object('check', 're-hashed edit breaks the chain', 'detail', 'chain still ok'); end if;

  -- a removed record leaves a gap
  delete from public.audit_records where id = a1;
  checks := checks + 1;
  select * into r from public.audit_integrity(org) i where i.id = a2;
  if r.chain_ok then failures := failures || jsonb_build_object('check', 'removed record breaks the chain', 'detail', 'chain still ok'); end if;
  alter table public.audit_records enable trigger audit_immutable;

  raise exception 'AUDIT_SEAL_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
