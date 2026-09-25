-- Stage 5 database guarantees: recipe FINAL, server-only preflight fields,
-- approval only through approve_process_plan. Runs inside one DO block that
-- always ends in RAISE, so nothing persists. Result: 'APPROVAL_FLOW_RESULT {json}'.
do $test$
declare
  u_eng uuid := gen_random_uuid(); u_op uuid := gen_random_uuid(); u_view uuid := gen_random_uuid();
  org uuid; site uuid; machine uuid; mat uuid; mat2 uuid; mat3 uuid; recipe uuid; rv uuid; plan uuid;
  n bigint; st text; checks int := 0;
  failures jsonb := '[]'::jsonb;
begin
  insert into auth.users (id, aud, role, email) values
    (u_eng, 'authenticated', 'authenticated', 'ap-eng-' || u_eng || '@test.invalid'),
    (u_op, 'authenticated', 'authenticated', 'ap-op-' || u_op || '@test.invalid'),
    (u_view, 'authenticated', 'authenticated', 'ap-view-' || u_view || '@test.invalid');
  insert into public.organizations (name) values ('Approval test') returning id into org;
  insert into public.organization_members (organization_id, user_id, role) values
    (org, u_eng, 'ENGINEER'), (org, u_op, 'OPERATOR'), (org, u_view, 'VIEWER');
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id, configured_max_rpm, zone_count) values (org, site, 400, 3) returning id into machine;
  insert into public.materials (organization_id, name) values (org, 'm') returning id into mat;
  insert into public.materials (organization_id, name) values (org, 'm2') returning id into mat2;
  insert into public.materials (organization_id, name) values (org, 'm3') returning id into mat3;

  -- ---------------------------------------------------------------- as ENGINEER
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_eng::text, true);
  set local role authenticated;

  insert into public.recipes (organization_id, name) values (org, 'r') returning id into recipe;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, recipe, 1) returning id into rv;
  insert into public.recipe_components (organization_id, recipe_version_id, material_id, percent_wet) values (org, rv, mat, 60);

  checks := checks + 1;  -- FINAL refused while components sum to 60 %
  begin
    update public.recipe_versions set status = 'FINAL' where id = rv;
    failures := failures || jsonb_build_object('check', 'final with sum 60 refused', 'detail', 'accepted');
  exception when others then null; end;

  insert into public.recipe_components (organization_id, recipe_version_id, material_id, percent_wet) values (org, rv, mat2, 40);
  checks := checks + 1;  -- FINAL accepted at 100 %
  begin
    update public.recipe_versions set status = 'FINAL' where id = rv;
  exception when others then
    failures := failures || jsonb_build_object('check', 'final with sum 100 accepted', 'sqlstate', sqlstate, 'msg', sqlerrm);
  end;

  checks := checks + 1;  -- FINAL version is frozen
  begin
    insert into public.recipe_components (organization_id, recipe_version_id, material_id, percent_wet) values (org, rv, mat3, 1);
    failures := failures || jsonb_build_object('check', 'component added to FINAL refused', 'detail', 'accepted');
  exception when others then null; end;

  insert into public.process_plans (organization_id, recipe_version_id, machine_id, screw_rpm, zone_setpoints_c)
    values (org, rv, machine, 300, array[80, 100, 120]) returning id into plan;

  checks := checks + 1;  -- the app cannot insert its own decision
  begin
    insert into public.process_plans (organization_id, recipe_version_id, machine_id, preflight_status)
      values (org, rv, machine, 'READY_FOR_OPERATOR_REVIEW');
    failures := failures || jsonb_build_object('check', 'insert with decision refused', 'detail', 'accepted');
  exception when others then null; end;

  checks := checks + 1;  -- nor write a decision onto an existing plan
  begin
    update public.process_plans set preflight_status = 'READY_FOR_OPERATOR_REVIEW' where id = plan;
    failures := failures || jsonb_build_object('check', 'update decision refused', 'detail', 'accepted');
  exception when others then null; end;

  checks := checks + 1;  -- no decision -> approval refused
  begin
    perform public.approve_process_plan(plan);
    failures := failures || jsonb_build_object('check', 'approve without decision refused', 'detail', 'accepted');
  exception when others then null; end;

  -- ---------------------------------------------------------------- engine decision (trusted role only)
  reset role;
  update public.process_plans set preflight_status = 'READY_FOR_OPERATOR_REVIEW', preflight_at = now() where id = plan;

  -- VIEWER cannot approve
  perform set_config('request.jwt.claims', json_build_object('sub', u_view, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_view::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    perform public.approve_process_plan(plan);
    failures := failures || jsonb_build_object('check', 'viewer approval refused', 'detail', 'accepted');
  exception when others then null; end;
  reset role;

  -- OPERATOR approves once
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_op::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin
    perform public.approve_process_plan(plan);
  exception when others then
    failures := failures || jsonb_build_object('check', 'operator approval accepted', 'sqlstate', sqlstate, 'msg', sqlerrm);
  end;
  select count(*) into n from public.process_plans where id = plan and approved_by = u_op and approved_at is not null;
  checks := checks + 1;
  if n <> 1 then failures := failures || jsonb_build_object('check', 'approval records operator and time', 'rows', n); end if;

  checks := checks + 1;
  begin
    perform public.approve_process_plan(plan);
    failures := failures || jsonb_build_object('check', 'second approval refused', 'detail', 'accepted');
  exception when others then null; end;
  reset role;

  -- ENGINEER changes a plan input: decision and approval are voided
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u_eng::text, true);
  set local role authenticated;
  update public.process_plans set screw_rpm = 310 where id = plan;
  select count(*) into n from public.process_plans where id = plan and preflight_status is null and approved_by is null and approved_at is null;
  checks := checks + 1;
  if n <> 1 then failures := failures || jsonb_build_object('check', 'input change voids decision and approval', 'rows', n); end if;
  reset role;

  raise exception 'APPROVAL_FLOW_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
