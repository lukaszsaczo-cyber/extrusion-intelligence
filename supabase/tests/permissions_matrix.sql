-- Stage 7: the role matrix shown in Settings, checked cell by cell against the
-- live RLS policies and RPC role checks. Each role tries one representative
-- write per action; "allowed" means the database accepted it.
-- Always ends in RAISE, so nothing persists. Result: 'PERMISSIONS_MATRIX_RESULT {json}'.
do $test$
declare
  -- MATRIX (must equal lib/settings/permissions.ts; permissions.test.ts checks it)
  expected jsonb := '{"view":["ADMIN","ENGINEER","OPERATOR","VIEWER"],"organization":["ADMIN"],"sites":["ADMIN"],"members":["ADMIN"],"machines_materials_recipes":["ADMIN","ENGINEER"],"process_plans":["ADMIN","ENGINEER"],"runs_and_import":["ADMIN","ENGINEER","OPERATOR"],"product_measurements":["ADMIN","ENGINEER","OPERATOR"],"approve_plan":["ADMIN","ENGINEER","OPERATOR"],"quality_and_diagnosis":["ADMIN","ENGINEER"],"seal_audit":["ADMIN","ENGINEER"],"fail_loop":["ADMIN","ENGINEER"],"engine_results":[]}';
  roles text[] := array['ADMIN','ENGINEER','OPERATOR','VIEWER'];
  users jsonb := '{}'::jsonb; plans jsonb := '{}'::jsonb;
  org uuid; site uuid; machine uuid; recipe uuid; rv uuid; run uuid; p uuid; u uuid; newbie uuid; run_c uuid; plan_c uuid;
  rl text; ok boolean; n bigint;
  observed jsonb := '{}'::jsonb;
  mismatches jsonb := '[]'::jsonb; a text;
begin
  insert into public.organizations (name) values ('Permissions test') returning id into org;
  foreach rl in array roles loop
    u := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (u, 'authenticated', 'authenticated', 'pm-' || lower(rl) || '-' || u || '@test.invalid');
    insert into public.organization_members (organization_id, user_id, role) values (org, u, rl::public.app_role);
    users := users || jsonb_build_object(rl, u);
  end loop;
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into machine;
  insert into public.recipes (organization_id, name) values (org, 'r') returning id into recipe;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, recipe, 1) returning id into rv;
  insert into public.runs (organization_id, machine_id, run_code) values (org, machine, 'PM') returning id into run;
  -- one plan per role with an engine decision, so each role gets a fresh approval attempt
  foreach rl in array roles loop
    insert into public.process_plans (organization_id, recipe_version_id, machine_id) values (org, rv, machine) returning id into p;
    update public.process_plans set preflight_status = 'READY_FOR_OPERATOR_REVIEW', preflight_at = now() where id = p;
    plans := plans || jsonb_build_object(rl, p);
  end loop;
  -- a completed run on an approved plan, for the FAIL loop's product verification
  insert into public.process_plans (organization_id, recipe_version_id, machine_id) values (org, rv, machine) returning id into plan_c;
  update public.process_plans set preflight_status = 'READY_FOR_OPERATOR_REVIEW', preflight_at = now(), approved_at = now(), approved_by = (users ->> 'ADMIN')::uuid where id = plan_c;
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, machine, plan_c, 'PM-C') returning id into run_c;
  update public.runs set status = 'RUNNING', started_at = now() - interval '2 hours' where id = run_c;
  update public.runs set status = 'COMPLETED', ended_at = now() - interval '1 hour' where id = run_c;
  foreach a in array array(select jsonb_object_keys(expected)) loop observed := observed || jsonb_build_object(a, '[]'::jsonb); end loop;

  foreach rl in array roles loop
    newbie := gen_random_uuid();
    insert into auth.users (id, aud, role, email) values (newbie, 'authenticated', 'authenticated', 'pm-new-' || newbie || '@test.invalid');
    perform set_config('request.jwt.claims', json_build_object('sub', users ->> rl, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) > 0 into ok from public.runs where organization_id = org;
    if ok then observed := jsonb_set(observed, '{view}', (observed -> 'view') || to_jsonb(rl)); end if;

    update public.organizations set name = 'Permissions test ' || rl where id = org;
    get diagnostics n = row_count;
    if n > 0 then observed := jsonb_set(observed, '{organization}', (observed -> 'organization') || to_jsonb(rl)); end if;

    begin insert into public.sites (organization_id, name) values (org, 's-' || rl);
      observed := jsonb_set(observed, '{sites}', (observed -> 'sites') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.organization_members (organization_id, user_id, role) values (org, newbie, 'VIEWER');
      observed := jsonb_set(observed, '{members}', (observed -> 'members') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.machines (organization_id, site_id) values (org, site);
      observed := jsonb_set(observed, '{machines_materials_recipes}', (observed -> 'machines_materials_recipes') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.process_plans (organization_id, recipe_version_id, machine_id) values (org, rv, machine);
      observed := jsonb_set(observed, '{process_plans}', (observed -> 'process_plans') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.runs (organization_id, machine_id, run_code) values (org, machine, 'PM-' || rl);
      observed := jsonb_set(observed, '{runs_and_import}', (observed -> 'runs_and_import') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.product_samples (organization_id, run_id, sample_code) values (org, run, 'S-' || rl);
      observed := jsonb_set(observed, '{product_measurements}', (observed -> 'product_measurements') || to_jsonb(rl));
    exception when others then null; end;

    begin perform public.approve_process_plan((plans ->> rl)::uuid);
      observed := jsonb_set(observed, '{approve_plan}', (observed -> 'approve_plan') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, run, 'pm-test', 'INSUFFICIENT_DATA');
      observed := jsonb_set(observed, '{quality_and_diagnosis}', (observed -> 'quality_and_diagnosis') || to_jsonb(rl));
    exception when others then null; end;

    begin perform public.seal_run_audit(run);
      observed := jsonb_set(observed, '{seal_audit}', (observed -> 'seal_audit') || to_jsonb(rl));
    exception when others then null; end;

    begin perform public.record_product_verification(run_c);
      observed := jsonb_set(observed, '{fail_loop}', (observed -> 'fail_loop') || to_jsonb(rl));
    exception when others then null; end;

    begin insert into public.verifications (organization_id, run_id, kind, state) values (org, run, 'PRODUCT', 'VERIFIED_PASS');
      observed := jsonb_set(observed, '{engine_results}', (observed -> 'engine_results') || to_jsonb(rl));
    exception when others then null; end;

    reset role;
  end loop;

  foreach a in array array(select jsonb_object_keys(expected)) loop
    if observed -> a <> expected -> a then
      mismatches := mismatches || jsonb_build_object('action', a, 'expected', expected -> a, 'observed', observed -> a);
    end if;
  end loop;

  raise exception 'PERMISSIONS_MATRIX_RESULT %', jsonb_build_object(
    'actions', (select count(*) from jsonb_object_keys(expected)), 'roles', array_length(roles, 1),
    'mismatches', mismatches, 'verdict', case when jsonb_array_length(mismatches) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
