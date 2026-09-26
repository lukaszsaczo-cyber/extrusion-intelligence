-- Engine results (migration 0015): only callers holding a registered engine
-- write key, with an ADMIN/ENGINEER role in the plan's organization, can store a
-- decision or verification, and only in the shape of ei-engine-contract.
-- A test key is registered inside the transaction; everything is rolled back.
-- Result: 'ENGINE_RESULTS_RESULT {json}'.
do $test$
declare
  k text := 'test-engine-write-key-' || replace(gen_random_uuid()::text, '-', '');
  u_eng uuid := gen_random_uuid(); u_op uuid := gen_random_uuid(); u_other uuid := gen_random_uuid();
  org uuid; org2 uuid; site uuid; m uuid; rec uuid; rv uuid; plan uuid; run uuid; ts timestamptz; key_id uuid;
  good jsonb := '{"status":"READY_FOR_OPERATOR_REVIEW","confidence_label":"LOW","risk_categories":["VALIDATION_REQUIRED"],
    "missing_inputs":["recipe.moisture"],
    "proposed_test":{"parameter":"zone_temperature","current":120,"proposed":125,"zone":3,"observe_s":600},
    "predictions":[{"metric":"pressure","kind":"RANGE","min":80,"max":95,"unit":"bar"},{"metric":"sme","kind":"VALUE","value":110,"unit":"Wh/kg"}]}';
  checks int := 0; failures jsonb := '[]'::jsonb; n bigint; r record;

begin
  insert into auth.users (id, aud, role, email) values
    (u_eng, 'authenticated', 'authenticated', 'er-eng-' || u_eng || '@test.invalid'),
    (u_op, 'authenticated', 'authenticated', 'er-op-' || u_op || '@test.invalid'),
    (u_other, 'authenticated', 'authenticated', 'er-other-' || u_other || '@test.invalid');
  insert into public.organizations (name) values ('Engine results test') returning id into org;
  insert into public.organizations (name) values ('Engine results other') returning id into org2;
  insert into public.organization_members (organization_id, user_id, role) values (org, u_eng, 'ENGINEER'), (org, u_op, 'OPERATOR'), (org2, u_other, 'ENGINEER');
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into m;
  insert into public.recipes (organization_id, name) values (org, 'r') returning id into rec;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, rec, 1) returning id into rv;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, screw_rpm) values (org, rv, m, 300) returning id into plan;
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, m, plan, 'E1') returning id into run;
  select updated_at into ts from public.process_plans where id = plan;

  -- 1. no key registered yet: refused
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good);
    failures := failures || '{"check":"unregistered key refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_key%' then failures := failures || jsonb_build_object('check','unregistered key refused','msg',sqlerrm); end if; end;
  -- 2. users cannot read or register keys
  checks := checks + 1;
  begin insert into private.engine_write_keys (key_sha256) values (encode(sha256(convert_to(k, 'UTF8')), 'hex'));
    failures := failures || '{"check":"user cannot register a key","detail":"accepted"}';
  exception when others then null; end;
  reset role;

  insert into private.engine_write_keys (key_sha256, label) values (encode(sha256(convert_to(k, 'UTF8')), 'hex'), 'test') returning id into key_id;

  -- 3. a wrong key is refused
  set local role authenticated;
  checks := checks + 1;
  begin perform public.record_engine_decision(k || 'x', plan, ts, good);
    failures := failures || '{"check":"wrong key refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_key%' then failures := failures || jsonb_build_object('check','wrong key refused','msg',sqlerrm); end if; end;
  reset role;

  -- 4. OPERATOR (right key) and another organization's ENGINEER are refused
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good);
    failures := failures || '{"check":"operator refused","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','operator refused','msg',sqlerrm); end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good);
    failures := failures || '{"check":"other organization refused","detail":"accepted"}';
  exception when others then if sqlstate not in ('42501', 'P0002') then failures := failures || jsonb_build_object('check','other organization refused','msg',sqlerrm); end if; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- 5. stale plan (changed after the engine was asked)
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts - interval '1 second', good);
    failures := failures || '{"check":"stale plan refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_stale%' then failures := failures || jsonb_build_object('check','stale plan refused','msg',sqlerrm); end if; end;
  -- 6-10. shapes outside the contract
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"status":"LOOKS_FINE"}');
    failures := failures || '{"check":"status outside contract refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','status outside contract refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"predictions":[{"metric":"pressure","kind":"VALUE","value":90,"unit":"psi"}]}');
    failures := failures || '{"check":"engine unit refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','engine unit refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"missing_inputs":["Internal Model Note"]}');
    failures := failures || '{"check":"free-text missing input refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','free-text missing input refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"proposed_test":{"parameter":"zone_temperature","current":1,"proposed":2,"observe_s":60}}');
    failures := failures || '{"check":"zone test without zone refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','zone test without zone refused','msg',sqlerrm); end if; end;
  -- missing fields must refuse, not slip through as NULL (bug fixed by 0016)
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"predictions":[{"metric":"pressure","kind":"VALUE","unit":"bar"}]}');
    failures := failures || '{"check":"prediction without value refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','prediction without value refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"proposed_test":{"parameter":"screw_speed","proposed":2,"observe_s":60}}');
    failures := failures || '{"check":"test without current value refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','test without current value refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"missing_inputs":[null]}');
    failures := failures || '{"check":"null missing input refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','null missing input refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good || '{"risk_categories":["SECRET_REASON"]}');
    failures := failures || '{"check":"risk category outside contract refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','risk category outside contract refused','msg',sqlerrm); end if; end;
  -- 11. nothing was written by the refused calls
  checks := checks + 1;
  select count(*) into n from public.process_plans where id = plan and preflight_status is null;
  if n <> 1 then failures := failures || '{"check":"refused calls wrote nothing","detail":"decision present"}'; end if;

  -- 12. a contract-shaped decision is stored, with contract units
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good);
  exception when others then failures := failures || jsonb_build_object('check','valid decision stored','msg',sqlerrm); end;
  select preflight_status, confidence_label, risk_categories, missing_inputs, proposed_test_unit, proposed_test_zone, preflight_at
    into r from public.process_plans where id = plan;
  checks := checks + 1;
  if not (r.preflight_status = 'READY_FOR_OPERATOR_REVIEW' and r.confidence_label = 'LOW' and r.proposed_test_unit = '°C'
          and r.proposed_test_zone = 3 and r.preflight_at is not null and r.missing_inputs = array['recipe.moisture']) then
    failures := failures || jsonb_build_object('check','stored decision content','row', to_jsonb(r));
  end if;
  checks := checks + 1;
  select count(*) into n from public.plan_predictions where process_plan_id = plan;
  if n <> 2 then failures := failures || jsonb_build_object('check','predictions stored','rows', n); end if;
  -- 13. the user still cannot write decision fields directly
  checks := checks + 1;
  begin update public.process_plans set preflight_status = 'DO_NOT_RUN' where id = plan;
    failures := failures || '{"check":"direct decision write still refused","detail":"accepted"}';
  exception when others then null; end;
  reset role;

  -- 14. approval, then a new decision on the approved plan is refused
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_process_plan(plan);
  -- run: verification before completion refused
  update public.runs set status = 'RUNNING', started_at = now() - interval '2 hours' where id = run;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select updated_at into ts from public.process_plans where id = plan;
  checks := checks + 1;
  begin perform public.record_engine_decision(k, plan, ts, good);
    failures := failures || '{"check":"decision on approved plan refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_locked%' then failures := failures || jsonb_build_object('check','decision on approved plan refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_engine_verification(k, run, '{"state":"VERIFIED_PASS","evidence_saved":true}');
    failures := failures || '{"check":"verification before completion refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_run_not_completed%' then failures := failures || jsonb_build_object('check','verification before completion refused','msg',sqlerrm); end if; end;
  update public.runs set status = 'COMPLETED', ended_at = now() - interval '1 hour' where id = run;
  -- 15. state outside contract refused; evidence only for VERIFIED_PASS with strict true
  checks := checks + 1;
  begin perform public.record_engine_verification(k, run, '{"state":"PASS"}');
    failures := failures || '{"check":"verification state outside contract refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_contract%' then failures := failures || jsonb_build_object('check','verification state outside contract refused','msg',sqlerrm); end if; end;
  perform public.record_engine_verification(k, run, '{"state":"VERIFIED_FAIL","evidence_saved":true}');
  perform public.record_engine_verification(k, run, '{"state":"VERIFIED_PASS","evidence_saved":"true"}');
  perform public.record_engine_verification(k, run, '{"state":"VERIFIED_PASS","evidence_saved":true}');
  checks := checks + 1;
  if (select jsonb_agg(jsonb_build_array(kind, state, evidence_saved) order by created_at, state desc, evidence_saved)
      from public.verifications where run_id = run) <> '[["ENGINE","VERIFIED_FAIL",false],["ENGINE","VERIFIED_PASS",false],["ENGINE","VERIFIED_PASS",true]]'::jsonb then
    failures := failures || jsonb_build_object('check','evidence rule', 'rows',
      (select jsonb_agg(jsonb_build_array(kind, state, evidence_saved)) from public.verifications where run_id = run));
  end if;
  reset role;

  -- 16. a revoked key stops working
  update private.engine_write_keys set revoked_at = now() where id = key_id;
  set local role authenticated;
  checks := checks + 1;
  begin perform public.record_engine_verification(k, run, '{"state":"INCOMPLETE"}');
    failures := failures || '{"check":"revoked key refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'engine_key%' then failures := failures || jsonb_build_object('check','revoked key refused','msg',sqlerrm); end if; end;
  reset role;

  -- 17. anon cannot call the functions at all
  set local role anon;
  checks := checks + 1;
  begin perform public.record_engine_verification(k, run, '{"state":"INCOMPLETE"}');
    failures := failures || '{"check":"anon refused","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','anon refused','msg',sqlerrm); end if; end;
  reset role;

  raise exception 'ENGINE_RESULTS_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
