-- Stage 6 database guarantees: verifications and plan predictions are written
-- by the engine only (no user can insert them, not even ADMIN); product
-- samples and measurements can be added, measurements cannot be changed.
-- Always ends in RAISE, so nothing persists. Result: 'VERIFICATION_GUARD_RESULT {json}'.
do $test$
declare
  u uuid := gen_random_uuid();
  org uuid; site uuid; machine uuid; mat uuid; recipe uuid; rv uuid; plan uuid; run uuid; sample uuid; meas uuid;
  n bigint; checks int := 0;
  failures jsonb := '[]'::jsonb;
begin
  insert into auth.users (id, aud, role, email) values (u, 'authenticated', 'authenticated', 'vg-' || u || '@test.invalid');
  insert into public.organizations (name) values ('Verification guard test') returning id into org;
  insert into public.organization_members (organization_id, user_id, role) values (org, u, 'ADMIN');
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into machine;
  insert into public.materials (organization_id, name) values (org, 'm') returning id into mat;
  insert into public.recipes (organization_id, name) values (org, 'r') returning id into recipe;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, recipe, 1) returning id into rv;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id) values (org, rv, machine) returning id into plan;
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, machine, plan, 'R') returning id into run;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;

  checks := checks + 1;
  begin
    insert into public.verifications (organization_id, run_id, kind, state) values (org, run, 'PRODUCT', 'VERIFIED_PASS');
    failures := failures || jsonb_build_object('check', 'user cannot write a verification', 'detail', 'accepted');
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'user cannot write a verification', 'sqlstate', sqlstate); end if;
  end;

  checks := checks + 1;
  begin
    insert into public.plan_predictions (organization_id, process_plan_id, metric, kind, value, unit) values (org, plan, 'pressure', 'VALUE', 1, 'bar');
    failures := failures || jsonb_build_object('check', 'user cannot write a prediction', 'detail', 'accepted');
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'user cannot write a prediction', 'sqlstate', sqlstate); end if;
  end;

  checks := checks + 1;
  begin
    insert into public.product_samples (organization_id, run_id, sample_code) values (org, run, 'S1') returning id into sample;
    insert into public.product_measurements (organization_id, product_sample_id, parameter, value, unit) values (org, sample, 'moisture', 5, '%') returning id into meas;
  exception when others then
    failures := failures || jsonb_build_object('check', 'sample and measurement can be added', 'sqlstate', sqlstate, 'msg', sqlerrm);
  end;

  checks := checks + 1;
  begin
    update public.product_measurements set value = 6 where id = meas;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('check', 'measurement cannot be changed', 'rows', n); end if;
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'measurement cannot be changed', 'sqlstate', sqlstate); end if;
  end;

  checks := checks + 1;
  begin
    delete from public.product_measurements where id = meas;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('check', 'measurement cannot be deleted', 'rows', n); end if;
  exception when others then
    if sqlstate <> '42501' then failures := failures || jsonb_build_object('check', 'measurement cannot be deleted', 'sqlstate', sqlstate); end if;
  end;
  reset role;

  raise exception 'VERIFICATION_GUARD_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
