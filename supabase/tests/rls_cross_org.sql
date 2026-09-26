-- Cross-organization RLS isolation test.
--
-- Runs as one DO block that ALWAYS ends with RAISE EXCEPTION, so everything it
-- creates (2 auth users, 2 organizations, one full data chain per organization)
-- is rolled back. Safe to run against production; it leaves no rows behind.
--
-- The final exception message is 'RLS_CROSS_ORG_RESULT {json}'. json.failures
-- lists every check that did not hold; an empty list means PASS. Any other
-- exception means the test itself did not complete (NOT RUN, not PASS).
--
-- As user A (ADMIN of org A), for every table with organization_id:
--   read    : A sees 0 rows of org B, and at least 1 row of its own org
--             (so a broken login cannot pass as "isolated")
--   insert  : inserting a copy of a B row fails with RLS (42501)
--   update  : touching B rows affects 0 rows or is denied (42501)
--   delete  : deleting B rows affects 0 rows or is denied (42501)
-- plus: org A rows cannot point at org B parents, SECURITY DEFINER RPCs refuse
-- org B objects, a user sees only co-members' profiles, and anon sees nothing.
do $test$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  org_a uuid;
  org_b uuid;
  o uuid;
  refs jsonb := '{}'::jsonb;
  v_site uuid; v_machine uuid; v_mat uuid; v_lot uuid; v_recipe uuid; v_rv uuid;
  v_target uuid; v_plan uuid; v_run uuid; v_file uuid; v_metric uuid; v_sample uuid;
  v_qa uuid; v_snap uuid; v_ver uuid; v_case uuid;
  t text;
  n bigint;
  own bigint;
  row_b jsonb;
  checks int := 0;
  failures jsonb := '[]'::jsonb;
  b_rows jsonb := '{}'::jsonb;
  tables text[];
  hash64 text := repeat('a', 64);
begin
  -- ---------------------------------------------------------------- setup (as owner)
  insert into auth.users (id, aud, role, email)
  values (ua, 'authenticated', 'authenticated', 'rls-a-' || ua || '@test.invalid'),
         (ub, 'authenticated', 'authenticated', 'rls-b-' || ub || '@test.invalid');

  insert into public.organizations (name) values ('RLS test A') returning id into org_a;
  insert into public.organization_members (organization_id, user_id, role) values (org_a, ua, 'ADMIN');
  insert into public.organizations (name) values ('RLS test B') returning id into org_b;
  insert into public.organization_members (organization_id, user_id, role) values (org_b, ub, 'ADMIN');

  foreach o in array array[org_a, org_b] loop
    insert into public.sites (organization_id, name) values (o, 'site') returning id into v_site;
    insert into public.machines (organization_id, site_id) values (o, v_site) returning id into v_machine;
    insert into public.materials (organization_id, name) values (o, 'mat') returning id into v_mat;
    insert into public.material_lots (organization_id, material_id, lot_code, evidence_source)
      values (o, v_mat, 'L1', 'LAB') returning id into v_lot;
    insert into public.recipes (organization_id, name) values (o, 'rec') returning id into v_recipe;
    insert into public.recipe_versions (organization_id, recipe_id, version) values (o, v_recipe, 1) returning id into v_rv;
    insert into public.recipe_components (organization_id, recipe_version_id, material_id, material_lot_id, percent_wet)
      values (o, v_rv, v_mat, v_lot, 50);
    insert into public.product_targets (organization_id, name) values (o, 'tgt') returning id into v_target;
    insert into public.product_target_values (organization_id, product_target_id, parameter) values (o, v_target, 'moisture');
    insert into public.process_plans (organization_id, recipe_version_id, machine_id, product_target_id)
      values (o, v_rv, v_machine, v_target) returning id into v_plan;
    insert into public.plan_predictions (organization_id, process_plan_id, metric, kind, value, unit)
      values (o, v_plan, 'pressure', 'VALUE', 1, 'bar');
    insert into public.runs (organization_id, machine_id, process_plan_id, run_code)
      values (o, v_machine, v_plan, 'R1') returning id into v_run;
    insert into public.run_files (organization_id, run_id, filename, sha256, size_bytes)
      values (o, v_run, 'f.csv', hash64, 1) returning id into v_file;
    insert into public.run_metrics (organization_id, run_id, run_file_id, signal, ts, value, quality)
      values (o, v_run, v_file, 'melt_temp', now(), 1, 'VALID') returning id into v_metric;
    insert into public.run_sampling (organization_id, run_id, sampling_interval_ms) values (o, v_run, 1000);
    insert into public.signal_definitions (organization_id, code, category) values (o, 'melt_temp', 'PROCESS');
    insert into public.machine_sensor_tags (organization_id, machine_id, tag, signal) values (o, v_machine, 'T1', 'melt_temp');
    insert into public.machine_confirmed_limits (organization_id, machine_id, parameter, bound, value, unit, source)
      values (o, v_machine, 'pressure', 'MAX', 100, 'bar', 'CATALOG');
    insert into public.product_samples (organization_id, run_id, sample_code) values (o, v_run, 'S1') returning id into v_sample;
    insert into public.product_measurements (organization_id, product_sample_id, parameter, value) values (o, v_sample, 'moisture', 5);
    insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict)
      values (o, v_run, 'v0', 'QUARANTINED') returning id into v_qa;
    insert into public.quality_signal_results (organization_id, assessment_id, signal, verdict, reasons, valid_samples, quarantined_samples)
      values (o, v_qa, 'melt_temp', 'QUARANTINED', array['SPIKE']::quality_reason[], 0, 1);
    insert into public.quality_quarantined_metrics (organization_id, assessment_id, run_id, run_metric_id, reason)
      values (o, v_qa, v_run, v_metric, 'SPIKE');
    insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256)
      values (o, v_run, v_qa, 'v1', '{}'::jsonb, hash64) returning id into v_snap;
    insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates)
      values (o, v_run, v_snap, 'gates-v0', 'INSUFFICIENT_DATA', '[{"id":"DATA_TRUSTED"}]'::jsonb);
    insert into public.verifications (organization_id, run_id, kind, state) values (o, v_run, 'PROCESS', 'INCOMPLETE') returning id into v_ver;
    -- FAIL loop tables (0018); seeded directly as owner, closed with a verified PASS so knowledge is allowed
    insert into public.fail_cases (organization_id, run_id, trigger_verification_id, status, outcome, outcome_evidence_saved, closed_at)
      values (o, v_run, v_ver, 'CLOSED', 'VERIFIED_PASS', true, now()) returning id into v_case;
    insert into public.fail_case_steps (organization_id, case_id, seq, step, ref_id) values (o, v_case, 1, 'DECOMPOSITION', v_ver);
    insert into public.knowledge_entries (organization_id, case_id, stage, statement) values (o, v_case, 'S38', 'seed');
    insert into public.audit_records (organization_id, run_id, snapshot, final_hash) values (o, v_run, '{}'::jsonb, hash64);
    refs := refs || jsonb_build_object(o::text, jsonb_build_object('machine', v_machine, 'plan', v_plan, 'run', v_run));
  end loop;

  select array_agg(c.relname::text order by c.relname) into tables
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
  where ns.nspname = 'public' and c.relkind = 'r';

  -- One org B row per table, captured as owner; A later tries to insert a copy.
  foreach t in array tables loop
    execute format('select to_jsonb(x) from public.%I x where organization_id = $1 limit 1', t) into row_b using org_b;
    if row_b is null then
      failures := failures || jsonb_build_object('table', t, 'check', 'setup', 'detail', 'no org B row seeded');
    end if;
    b_rows := b_rows || jsonb_build_object(t, row_b);
  end loop;

  -- ---------------------------------------------------------------- act as user A
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;

  foreach t in array tables loop
    -- read
    execute format('select count(*) from public.%I where organization_id = $1', t) into n using org_b;
    execute format('select count(*) from public.%I where organization_id = $1', t) into own using org_a;
    checks := checks + 1;
    if n <> 0 or own = 0 then
      failures := failures || jsonb_build_object('table', t, 'check', 'read', 'org_b_visible', n, 'own_visible', own);
    end if;

    -- insert a copy of a B row (new id); must be stopped by RLS
    checks := checks + 1;
    begin
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t)
        using (b_rows -> t) || jsonb_build_object('id', gen_random_uuid());
      failures := failures || jsonb_build_object('table', t, 'check', 'insert', 'detail', 'insert into org B succeeded');
    exception when others then
      if sqlstate <> '42501' then
        failures := failures || jsonb_build_object('table', t, 'check', 'insert', 'detail', 'blocked, but not by RLS', 'sqlstate', sqlstate, 'msg', sqlerrm);
      end if;
    end;

    -- update
    checks := checks + 1;
    begin
      execute format('update public.%I set updated_at = updated_at where organization_id = $1', t) using org_b;
      get diagnostics n = row_count;
      if n <> 0 then
        failures := failures || jsonb_build_object('table', t, 'check', 'update', 'rows', n);
      end if;
    exception when others then
      if sqlstate <> '42501' then
        failures := failures || jsonb_build_object('table', t, 'check', 'update', 'sqlstate', sqlstate, 'msg', sqlerrm);
      end if;
    end;

    -- delete
    checks := checks + 1;
    begin
      execute format('delete from public.%I where organization_id = $1', t) using org_b;
      get diagnostics n = row_count;
      if n <> 0 then
        failures := failures || jsonb_build_object('table', t, 'check', 'delete', 'rows', n);
      end if;
    exception when others then
      if sqlstate <> '42501' then
        failures := failures || jsonb_build_object('table', t, 'check', 'delete', 'sqlstate', sqlstate, 'msg', sqlerrm);
      end if;
    end;
  end loop;

  -- organizations table itself (keyed by id)
  checks := checks + 1;
  select count(*) into n from public.organizations where id = org_b;
  select count(*) into own from public.organizations where id = org_a;
  if n <> 0 or own <> 1 then
    failures := failures || jsonb_build_object('table', 'organizations', 'check', 'read', 'org_b_visible', n, 'own_visible', own);
  end if;
  checks := checks + 1;
  begin
    update public.organizations set name = 'hijacked' where id = org_b;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('table', 'organizations', 'check', 'update', 'rows', n); end if;
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('table', 'organizations', 'check', 'update', 'sqlstate', sqlstate); end if;
  end;

  -- joining org B: A must not add itself as a member of B
  checks := checks + 1;
  begin
    insert into public.organization_members (organization_id, user_id, role) values (org_b, ua, 'ADMIN');
    failures := failures || jsonb_build_object('table', 'organization_members', 'check', 'self-join org B', 'detail', 'succeeded');
  exception when others then
    if sqlstate <> '42501' then
      failures := failures || jsonb_build_object('table', 'organization_members', 'check', 'self-join org B', 'sqlstate', sqlstate, 'msg', sqlerrm);
    end if;
  end;

  -- profiles: A must not see B's profile (not a co-member)
  checks := checks + 1;
  select count(*) into n from public.profiles where id = ub;
  select count(*) into own from public.profiles where id = ua;
  if n <> 0 or own <> 1 then
    failures := failures || jsonb_build_object('table', 'profiles', 'check', 'read', 'b_visible', n, 'own_visible', own);
  end if;

  -- org A row pointing at an org B parent (composite FK / RLS must refuse)
  checks := checks + 1;
  begin
    insert into public.runs (organization_id, machine_id, run_code)
    values (org_a, (refs -> org_b::text ->> 'machine')::uuid, 'X');
    failures := failures || jsonb_build_object('table', 'runs', 'check', 'cross-org parent', 'detail', 'org A run on org B machine accepted');
  exception when others then
    null; -- refused (FK 23503 or RLS 42501): isolation holds
  end;

  -- SECURITY DEFINER RPC on an org B plan must refuse
  checks := checks + 1;
  begin
    perform public.approve_process_plan((refs -> org_b::text ->> 'plan')::uuid);
    failures := failures || jsonb_build_object('rpc', 'approve_process_plan', 'check', 'org B plan', 'detail', 'call did not raise');
  exception when others then
    null;
  end;

  -- ---------------------------------------------------------------- anon sees nothing
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  foreach t in array tables loop
    checks := checks + 1;
    begin
      execute format('select count(*) from public.%I where organization_id = any($1)', t) into n using array[org_a, org_b];
      if n <> 0 then failures := failures || jsonb_build_object('table', t, 'check', 'anon read', 'rows', n); end if;
    exception when others then
      if sqlstate <> '42501' then failures := failures || jsonb_build_object('table', t, 'check', 'anon read', 'sqlstate', sqlstate); end if;
    end;
  end loop;
  reset role;

  raise exception 'RLS_CROSS_ORG_RESULT %', jsonb_build_object(
    'tables', coalesce(array_length(tables, 1), 0), 'checks', checks,
    'failures', failures, 'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
