-- FAIL loop (migration 0018): product verification computed by the database,
-- the loop's order and references, the diagnosis loop-back, a named cause only
-- from a trusted role, and knowledge only from a loop closed with a verified
-- PASS. Always ends in RAISE, so nothing persists. Result: 'FAIL_LOOP_RESULT {json}'.
do $test$
declare
  u_eng uuid := gen_random_uuid(); u_op uuid := gen_random_uuid(); u_view uuid := gen_random_uuid();
  org uuid; site uuid; m1 uuid; m2 uuid; rec uuid; rv uuid; tgt uuid; p1 uuid; p2 uuid; p_other uuid;
  r1 uuid; r0 uuid; r2 uuid; s1 uuid; s2 uuid; v_fail uuid; v_inc uuid; v_pass uuid; v_fail2 uuid;
  cs uuid; cs2 uuid; qa1 uuid; qa2 uuid; qa0 uuid; qa_x uuid; sn1 uuid; sn2 uuid; d1 uuid; d2 uuid;
  x jsonb; n bigint; checks int := 0; failures jsonb := '[]'::jsonb;
  pass_gates jsonb := '[{"id":"DATA_RELIABLE","status":"PASS"},{"id":"MACHINE_STABLE","status":"PASS"},{"id":"DEVIATION_PERSISTENT","status":"PASS"},{"id":"COUPLED_SIGNALS","status":"PASS"},{"id":"CAUSE_SEPARABLE","status":"PASS"}]';
begin
  insert into auth.users (id, aud, role, email) values
    (u_eng, 'authenticated', 'authenticated', 'fl-eng-' || u_eng || '@test.invalid'),
    (u_op, 'authenticated', 'authenticated', 'fl-op-' || u_op || '@test.invalid'),
    (u_view, 'authenticated', 'authenticated', 'fl-view-' || u_view || '@test.invalid');
  insert into public.organizations (name) values ('Fail loop test') returning id into org;
  insert into public.organization_members (organization_id, user_id, role) values (org, u_eng, 'ENGINEER'), (org, u_op, 'OPERATOR'), (org, u_view, 'VIEWER');
  insert into public.sites (organization_id, name) values (org, 's') returning id into site;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into m1;
  insert into public.machines (organization_id, site_id) values (org, site) returning id into m2;
  insert into public.recipes (organization_id, name) values (org, 'r') returning id into rec;
  insert into public.recipe_versions (organization_id, recipe_id, version) values (org, rec, 1) returning id into rv;
  insert into public.product_targets (organization_id, name) values (org, 't') returning id into tgt;
  insert into public.product_target_values (organization_id, product_target_id, parameter, unit, min_value, max_value) values
    (org, tgt, 'moisture', '%', 5, 8), (org, tgt, 'density', 'g/l', 400, 450), (org, tgt, 'hardness', 'N', 1, 2);
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, product_target_id, water_kg_h) values (org, rv, m1, tgt, 10) returning id into p1;
  update public.process_plans set preflight_status = 'READY_FOR_OPERATOR_REVIEW', preflight_at = now() where id = p1;
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, m1, p1, 'F1') returning id into r1;
  insert into public.runs (organization_id, machine_id, run_code) values (org, m1, 'F0') returning id into r0;

  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_process_plan(p1);
  update public.runs set status = 'RUNNING', started_at = now() - interval '3 hours' where id = r1;
  update public.runs set status = 'COMPLETED', ended_at = now() - interval '2 hours' where id = r1;
  insert into public.product_samples (organization_id, run_id, sample_code) values (org, r1, 'S1') returning id into s1;
  insert into public.product_measurements (organization_id, product_sample_id, parameter, value, unit) values
    (org, s1, 'moisture', 9, '%'), (org, s1, 'moisture', 7, '%'), (org, s1, 'density', 420, 'g/l');
  checks := checks + 1;  -- operators do not record verifications
  begin perform public.record_product_verification(r1); failures := failures || '{"check":"operator cannot verify","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','operator cannot verify','msg',sqlerrm); end if; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- 1. product verification computed by the database (same rules as productCheck)
  v_fail := public.record_product_verification(r1);
  select jsonb_build_object('state', state, 'evidence', evidence_saved, 'rows', details -> 'rows') into x from public.verifications where id = v_fail;
  checks := checks + 1;
  if x <> jsonb_build_object('state', 'VERIFIED_FAIL', 'evidence', false, 'rows', '[
      {"parameter":"density","unit":"g/l","min":400,"max":450,"state":"VERIFIED_PASS","reason":null,"values":[420]},
      {"parameter":"hardness","unit":"N","min":1,"max":2,"state":"INCOMPLETE","reason":"NOT_MEASURED","values":[]},
      {"parameter":"moisture","unit":"%","min":5,"max":8,"state":"VERIFIED_FAIL","reason":"OUTSIDE","values":[9]}]'::jsonb) then
    failures := failures || jsonb_build_object('check', 'product verification content', 'got', x);
  end if;
  reset role;
  insert into public.verifications (organization_id, run_id, kind, state) values (org, r1, 'ENGINE', 'INCOMPLETE') returning id into v_inc;
  set local role authenticated;

  -- 2. the loop starts only from a VERIFIED_FAIL, once per verification, not by operators
  checks := checks + 1;
  begin perform public.open_fail_case(v_inc); failures := failures || '{"check":"open from non-FAIL refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_not_failed%' then failures := failures || jsonb_build_object('check','open from non-FAIL refused','msg',sqlerrm); end if; end;
  cs := public.open_fail_case(v_fail);
  checks := checks + 1;
  begin perform public.open_fail_case(v_fail); failures := failures || '{"check":"one case per verification","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;  -- ROZPAD I lists exactly the items that did not pass
  select payload -> 'items' into x from public.fail_case_steps where case_id = cs and seq = 1 and step = 'DECOMPOSITION';
  if (select jsonb_agg(i ->> 'parameter' order by i ->> 'parameter') from jsonb_array_elements(x) i) <> '["hardness","moisture"]'::jsonb then
    failures := failures || jsonb_build_object('check', 'decomposition items', 'got', x);
  end if;
  checks := checks + 1;
  begin insert into public.fail_case_steps (organization_id, case_id, seq, step) values (org, cs, 9, 'VERIFICATION');
    failures := failures || '{"check":"direct step insert refused","detail":"accepted"}';
  exception when others then null; end;

  -- 3. order and references
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'QUARANTINE', null, '{}'); failures := failures || '{"check":"skip separation refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_order%' then failures := failures || jsonb_build_object('check','skip separation refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'SEPARATION', null, '{"in_scope":["density"]}'); failures := failures || '{"check":"separation of a passing item refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_payload%' then failures := failures || jsonb_build_object('check','separation of a passing item refused','msg',sqlerrm); end if; end;
  perform public.record_fail_step(cs, 'SEPARATION', null, '{"in_scope":["moisture"],"note":"hardness not measured: out of scope"}');
  checks := checks + 1;
  if (select payload -> 'out_of_scope' from public.fail_case_steps where case_id = cs and step = 'SEPARATION') <> '["hardness"]'::jsonb then
    failures := failures || '{"check":"separation out_of_scope","detail":"wrong"}';
  end if;

  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r0, 'v0', 'VALID') returning id into qa0;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'QUARANTINE', qa0, '{}'); failures := failures || '{"check":"assessment of another run refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','assessment of another run refused','msg',sqlerrm); end if; end;
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'VALID') returning id into qa1;
  perform public.record_fail_step(cs, 'QUARANTINE', qa1, '{}');
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'CONSOLIDATION', qa1, '{}'); failures := failures || '{"check":"consolidation with a reference refused","detail":"accepted"}';
  exception when others then null; end;
  perform public.record_fail_step(cs, 'CONSOLIDATION', null, '{}');
  -- a snapshot of the same run but of an assessment that is not the quarantine step's
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'QUARANTINED') returning id into qa_x;
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256) values (org, r1, qa_x, 'v1', '{}', repeat('a', 64)) returning id into sn1;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'STATE_REFRESH', sn1, '{}'); failures := failures || '{"check":"snapshot of another assessment refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','snapshot of another assessment refused','msg',sqlerrm); end if; end;
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256) values (org, r1, qa1, 'v1', '{}', repeat('b', 64)) returning id into sn1;
  perform public.record_fail_step(cs, 'STATE_REFRESH', sn1, '{}');

  -- 4. a user cannot write a named cause, even with self-written passing gates
  checks := checks + 1;
  begin insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates, cause_category, confidence_label)
    values (org, r1, sn1, 'gates-v0', 'DIAGNOSED', pass_gates, 'CONFIGURATION_MISMATCH', 'LOW');
    failures := failures || '{"check":"user DIAGNOSED refused","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','user DIAGNOSED refused','msg',sqlerrm); end if; end;
  insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates)
    values (org, r1, sn1, 'gates-v0', 'INSUFFICIENT_DATA', '[{"id":"MACHINE_STABLE","status":"UNKNOWN"}]') returning id into d1;
  perform public.record_fail_step(cs, 'DIAGNOSIS', d1, '{}');
  -- 5. no named cause -> no repair; the loop returns to quarantine with new data
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', null, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}],"note":"x"}');
    failures := failures || '{"check":"repair without a named cause refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_order%' then failures := failures || jsonb_build_object('check','repair without a named cause refused','msg',sqlerrm); end if; end;
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'VALID') returning id into qa2;
  perform public.record_fail_step(cs, 'QUARANTINE', qa2, '{"note":"more data imported"}');
  perform public.record_fail_step(cs, 'CONSOLIDATION', null, '{}');
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256) values (org, r1, qa2, 'v1', '{}', repeat('c', 64)) returning id into sn2;
  perform public.record_fail_step(cs, 'STATE_REFRESH', sn2, '{}');
  reset role;
  -- the engine (trusted role) names a cause
  insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates, cause_category, confidence_label)
    values (org, r1, sn2, 'gates-v0', 'DIAGNOSED', pass_gates, 'CONFIGURATION_MISMATCH', 'LOW') returning id into d2;
  set local role authenticated;
  perform public.record_fail_step(cs, 'DIAGNOSIS', d2, '{}');

  -- 6. intervention = a new plan for the same machine, with changes and a rationale
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', p1, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}],"note":"x"}');
    failures := failures || '{"check":"the failed plan is not an intervention","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','the failed plan is not an intervention','msg',sqlerrm); end if; end;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, product_target_id) values (org, rv, m2, tgt) returning id into p_other;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', p_other, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}],"note":"x"}');
    failures := failures || '{"check":"plan of another machine refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','plan of another machine refused','msg',sqlerrm); end if; end;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, product_target_id, water_kg_h) values (org, rv, m1, tgt, 12) returning id into p2;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', p2, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}]}');
    failures := failures || '{"check":"intervention without rationale refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_payload%' then failures := failures || jsonb_build_object('check','intervention without rationale refused','msg',sqlerrm); end if; end;
  perform public.record_fail_step(cs, 'INTERVENTION', p2, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12,"unit":"kg/h"}],"note":"more water to lower moisture"}');

  -- 7. controlled test: a completed run on the intervention plan (approval chain from 0014 applies)
  reset role;
  update public.process_plans set preflight_status = 'TEST_REQUIRED', preflight_at = now() where id = p2;
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.approve_process_plan(p2);
  insert into public.runs (organization_id, machine_id, process_plan_id, run_code) values (org, m1, p2, 'F2') returning id into r2;
  update public.runs set status = 'RUNNING', started_at = now() - interval '1 hour' where id = r2;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'CONTROLLED_TEST', r2, '{}'); failures := failures || '{"check":"unfinished test refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','unfinished test refused','msg',sqlerrm); end if; end;
  update public.runs set status = 'COMPLETED', ended_at = now() - interval '10 minutes' where id = r2;
  perform public.record_fail_step(cs, 'CONTROLLED_TEST', r2, '{}');
  checks := checks + 1;
  begin perform public.add_knowledge(cs, 'S38', 'too early'); failures := failures || '{"check":"knowledge before verification refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'knowledge_refused%' then failures := failures || jsonb_build_object('check','knowledge before verification refused','msg',sqlerrm); end if; end;

  -- 8. verification of the controlled test closes the case
  insert into public.product_samples (organization_id, run_id, sample_code) values (org, r2, 'S2') returning id into s2;
  insert into public.product_measurements (organization_id, product_sample_id, parameter, value, unit) values
    (org, s2, 'moisture', 6.5, '%'), (org, s2, 'density', 430, 'g/l'), (org, s2, 'hardness', 1.4, 'N');
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'VERIFICATION', v_fail, '{}'); failures := failures || '{"check":"verification of another run refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','verification of another run refused','msg',sqlerrm); end if; end;
  v_pass := public.record_product_verification(r2);
  perform public.record_fail_step(cs, 'VERIFICATION', v_pass, '{}');
  checks := checks + 1;
  if (select jsonb_build_array(status, outcome, outcome_evidence_saved) from public.fail_cases where id = cs) <> '["CLOSED","VERIFIED_PASS",true]'::jsonb then
    failures := failures || jsonb_build_object('check', 'case closed with verified PASS', 'got', (select to_jsonb(f) from public.fail_cases f where id = cs));
  end if;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'SEPARATION', null, '{"in_scope":["moisture"]}'); failures := failures || '{"check":"closed case refuses steps","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_closed%' then failures := failures || jsonb_build_object('check','closed case refuses steps','msg',sqlerrm); end if; end;
  checks := checks + 1;
  select count(*) into n from public.fail_case_steps where case_id = cs;
  if n <> 13 then failures := failures || jsonb_build_object('check', 'all steps kept (incl. the first cycle)', 'steps', n); end if;

  -- 9. knowledge 38 -> 39 -> 40 -> CROSS, in order, once each
  checks := checks + 1;
  begin perform public.add_knowledge(cs, 'S39', 'x'); failures := failures || '{"check":"S39 before S38 refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'knowledge_order%' then failures := failures || jsonb_build_object('check','S39 before S38 refused','msg',sqlerrm); end if; end;
  perform public.add_knowledge(cs, 'S38', 'water 10 -> 12 kg/h brought moisture into 5-8 %');
  perform public.add_knowledge(cs, 'S39', 'second statement');
  perform public.add_knowledge(cs, 'S40', 'third statement');
  perform public.add_knowledge(cs, 'CROSS', 'cross statement');
  checks := checks + 1;
  begin perform public.add_knowledge(cs, 'S38', 'again'); failures := failures || '{"check":"stage recorded once","detail":"accepted"}';
  exception when others then null; end;

  -- 10. a case closed without a verified PASS never becomes knowledge; closing needs a reason
  v_fail2 := public.record_product_verification(r1);
  cs2 := public.open_fail_case(v_fail2);
  checks := checks + 1;
  begin perform public.close_fail_case(cs2, '  '); failures := failures || '{"check":"closing needs a reason","detail":"accepted"}';
  exception when others then null; end;
  perform public.close_fail_case(cs2, 'raw material batch no longer available');
  checks := checks + 1;
  begin perform public.add_knowledge(cs2, 'S38', 'not verified'); failures := failures || '{"check":"unverified case refused as knowledge","detail":"accepted"}';
  exception when others then if sqlerrm not like 'knowledge_refused%' then failures := failures || jsonb_build_object('check','unverified case refused as knowledge','msg',sqlerrm); end if; end;
  reset role;

  -- 11. records are append-only, even for the owner role
  checks := checks + 1;
  begin update public.fail_case_steps set payload = '{}' where case_id = cs; failures := failures || '{"check":"steps immutable","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;
  begin delete from public.knowledge_entries where case_id = cs; failures := failures || '{"check":"knowledge immutable","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;  -- the trusted role cannot bypass the knowledge rule either
  begin insert into public.knowledge_entries (organization_id, case_id, stage, statement) values (org, cs2, 'S38', 'forced');
    failures := failures || '{"check":"owner cannot force knowledge","detail":"accepted"}';
  exception when others then null; end;

  -- 12. operators do not drive the loop; viewers read it
  perform set_config('request.jwt.claims', json_build_object('sub', u_op, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  begin perform public.open_fail_case(v_fail2); failures := failures || '{"check":"operator cannot open","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','operator cannot open','msg',sqlerrm); end if; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_view, 'role', 'authenticated')::text, true);
  set local role authenticated;
  checks := checks + 1;
  select count(*) into n from public.fail_case_steps where case_id = cs;
  if n <> 13 then failures := failures || jsonb_build_object('check', 'viewer reads the loop', 'rows', n); end if;
  reset role;

  raise exception 'FAIL_LOOP_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
