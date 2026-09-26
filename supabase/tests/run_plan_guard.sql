-- DECISION -> APPROVAL -> RUN guard (migration 0014). Each check tries one
-- action as an app user (OPERATOR or ENGINEER) and records whether the
-- database accepted it; the expectation is next to it.
-- Always ends in RAISE, so nothing persists. Result: 'RUN_PLAN_GUARD_RESULT {json}'.
do $test$
declare
  u_op uuid := gen_random_uuid(); u_eng uuid := gen_random_uuid();
  org uuid; site uuid; m1 uuid; m2 uuid; rec uuid; rv uuid;
  p_open uuid; p_ok uuid; p_other uuid; p_free uuid; r uuid; r2 uuid; r3 uuid;
  checks int := 0; failures jsonb := '[]'::jsonb; ok boolean; n bigint;
begin
  insert into auth.users (id, aud, role, email) values
    (u_op, 'authenticated', 'authenticated', 'rg-op-' || u_op || '@test.invalid'),
    (u_eng, 'authenticated', 'authenticated', 'rg-eng-' || u_eng || '@test.invalid');
  insert into public.organizations (name) values ('Run guard test') returning id into org;
  insert into public.organization_members (organization_id, user_id, role) values (org, u_op, 'OPERATOR'), (org, u_eng, 'ENGINEER');
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into m1;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into m2;
  insert into public.recipes (organization_id, name) values (org, 'r') returning id into rec;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, rec, 1) returning id into rv;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, screw_rpm) values (org, rv, m1, 300) returning id into p_open;  -- no decision
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, screw_rpm) values (org, rv, m1, 300) returning id into p_ok;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, screw_rpm) values (org, rv, m2, 300) returning id into p_other;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id) values (org, rv, m1) returning id into p_free;
  update public.process_plans set preflight_status = 'READY_FOR_OPERATOR_REVIEW', preflight_at = now() where id in (p_ok, p_other);  -- engine decision (trusted role)

  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_process_plan(p_ok);

  -- 1. a run cannot be created already running
  checks := checks + 1;
  begin
    insert into public.runs (organization_id, machine_id, process_plan_id, run_code, status, started_at) values (org, m1, p_ok, 'X0', 'RUNNING', now());
    failures := failures || '{"check":"insert as RUNNING refused","detail":"accepted"}';
  exception when others then null; end;

  insert into public.runs (organization_id, machine_id, run_code) values (org, m1, 'R1') returning id into r;

  -- 2. no plan -> cannot start
  checks := checks + 1;
  begin
    update public.runs set status = 'RUNNING', started_at = now() where id = r;
    failures := failures || '{"check":"start without plan refused","detail":"accepted"}';
  exception when others then
    if sqlerrm not like 'run_not_approved%' then failures := failures || jsonb_build_object('check', 'start without plan refused', 'msg', sqlerrm); end if;
  end;

  -- 3. plan for another machine cannot be linked
  checks := checks + 1;
  begin
    update public.runs set process_plan_id = p_other where id = r;
    failures := failures || '{"check":"plan of another machine refused","detail":"accepted"}';
  exception when others then
    if sqlerrm not like 'run_machine%' then failures := failures || jsonb_build_object('check', 'plan of another machine refused', 'msg', sqlerrm); end if;
  end;

  -- 4. plan without decision/approval: link allowed, start refused
  update public.runs set process_plan_id = p_open where id = r;
  checks := checks + 1;
  begin
    update public.runs set status = 'RUNNING', started_at = now() where id = r;
    failures := failures || '{"check":"start on unapproved plan refused","detail":"accepted"}';
  exception when others then
    if sqlerrm not like 'run_not_approved%' then failures := failures || jsonb_build_object('check', 'start on unapproved plan refused', 'msg', sqlerrm); end if;
  end;

  -- 5. start time in the future refused
  update public.runs set process_plan_id = p_ok where id = r;
  checks := checks + 1;
  begin
    update public.runs set status = 'RUNNING', started_at = now() + interval '1 day' where id = r;
    failures := failures || '{"check":"future start refused","detail":"accepted"}';
  exception when others then
    if sqlerrm not like 'run_time%' then failures := failures || jsonb_build_object('check', 'future start refused', 'msg', sqlerrm); end if;
  end;

  -- 6. approved plan on the same machine: start accepted
  checks := checks + 1;
  begin
    update public.runs set status = 'RUNNING', started_at = now() - interval '1 hour' where id = r;
  exception when others then
    failures := failures || jsonb_build_object('check', 'start on approved plan accepted', 'msg', sqlerrm);
  end;

  -- 7. once started, the plan link is fixed
  checks := checks + 1;
  begin
    update public.runs set process_plan_id = null where id = r;
    failures := failures || '{"check":"relink after start refused","detail":"accepted"}';
  exception when others then
    if sqlerrm not like 'run_locked%' then failures := failures || jsonb_build_object('check', 'relink after start refused', 'msg', sqlerrm); end if;
  end;

  -- 8. a started run cannot be deleted
  checks := checks + 1;
  begin
    delete from public.runs where id = r;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('check', 'started run delete refused', 'rows', n); end if;
  exception when others then
    if sqlerrm not like 'run_locked%' then failures := failures || jsonb_build_object('check', 'started run delete refused', 'msg', sqlerrm); end if;
  end;

  -- 9. completing needs an end time; then the run is final
  checks := checks + 1;
  begin
    update public.runs set status = 'COMPLETED' where id = r;
    failures := failures || '{"check":"complete without end time refused","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;
  begin
    update public.runs set status = 'COMPLETED', ended_at = now() where id = r;
  exception when others then
    failures := failures || jsonb_build_object('check', 'complete with end time accepted', 'msg', sqlerrm);
  end;
  checks := checks + 1;
  begin
    update public.runs set status = 'RUNNING', ended_at = null where id = r;
    failures := failures || '{"check":"final run cannot be reopened","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;
  begin
    update public.runs set ended_at = now() - interval '5 minutes' where id = r;
    failures := failures || '{"check":"final run times cannot change","detail":"accepted"}';
  exception when others then null; end;

  -- 10. PLANNED -> ABORTED without times, and a PLANNED run can be deleted
  insert into public.runs (organization_id, machine_id, run_code) values (org, m1, 'R2') returning id into r2;
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, m1, p_open, 'R3') returning id into r3;
  checks := checks + 1;
  begin
    update public.runs set status = 'ABORTED' where id = r2;
  exception when others then
    failures := failures || jsonb_build_object('check', 'abort before start accepted', 'msg', sqlerrm);
  end;
  checks := checks + 1;
  begin
    delete from public.runs where id = r3;
    get diagnostics n = row_count;
    if n <> 1 then failures := failures || jsonb_build_object('check', 'planned run can be deleted', 'rows', n); end if;
  exception when others then
    failures := failures || jsonb_build_object('check', 'planned run can be deleted', 'msg', sqlerrm);
  end;
  reset role;

  -- ------------------------------------------------ plans, as ENGINEER
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 11. the plan a run was started on cannot change (its approval would be voided)
  checks := checks + 1;
  begin
    update public.process_plans set screw_rpm = 310 where id = p_ok;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('check', 'started plan cannot change', 'rows', n); end if;
  exception when others then
    if sqlerrm not like 'plan_locked%' then failures := failures || jsonb_build_object('check', 'started plan cannot change', 'msg', sqlerrm); end if;
  end;

  -- 12. an approved plan cannot be deleted
  checks := checks + 1;
  begin
    delete from public.process_plans where id = p_ok;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('check', 'approved plan delete refused', 'rows', n); end if;
  exception when others then
    if sqlerrm not like 'plan_locked%' then failures := failures || jsonb_build_object('check', 'approved plan delete refused', 'msg', sqlerrm); end if;
  end;

  -- 13. a plan used by a (planned) run cannot be deleted
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, m1, p_open, 'R4');
  checks := checks + 1;
  begin
    delete from public.process_plans where id = p_open;
    get diagnostics n = row_count;
    if n <> 0 then failures := failures || jsonb_build_object('check', 'used plan delete refused', 'rows', n); end if;
  exception when others then
    if sqlerrm not like 'plan_locked%' then failures := failures || jsonb_build_object('check', 'used plan delete refused', 'msg', sqlerrm); end if;
  end;

  -- 14. a plan still only planned on can be edited; an unused, unapproved plan can be deleted
  checks := checks + 1;
  begin
    update public.process_plans set screw_rpm = 250 where id = p_open;
    get diagnostics n = row_count;
    if n <> 1 then failures := failures || jsonb_build_object('check', 'plan with planned run editable', 'rows', n); end if;
  exception when others then
    failures := failures || jsonb_build_object('check', 'plan with planned run editable', 'msg', sqlerrm);
  end;
  checks := checks + 1;
  begin
    delete from public.process_plans where id = p_free;
    get diagnostics n = row_count;
    if n <> 1 then failures := failures || jsonb_build_object('check', 'unused plan deletable', 'rows', n); end if;
  exception when others then
    failures := failures || jsonb_build_object('check', 'unused plan deletable', 'msg', sqlerrm);
  end;
  reset role;

  -- 15. the rules hold for the owner role too (not only RLS)
  checks := checks + 1;
  begin
    update public.runs set process_plan_id = null where id = r;
    failures := failures || '{"check":"owner cannot relink a final run","detail":"accepted"}';
  exception when others then null; end;

  raise exception 'RUN_PLAN_GUARD_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
