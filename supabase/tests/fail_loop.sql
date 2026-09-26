-- FAIL loop in order A (migration 0019):
-- ROZPAD I -> DIAGNOZA -> 3 -> 6 -> 28 -> ODŚWIEŻENIE -> NAPRAWA -> TEST -> WERYFIKACJA
-- -> RAPORT -> 38 -> 39 -> 40 -> CROSS -> AUDIT. Covers the loop back to diagnosis when
-- no cause is named, a named cause only from a trusted role, 39's re-check on current
-- measurements, the 40 lock, audit-v3 and a case closed without PASS.
-- Always ends in RAISE, so nothing persists. Result: 'FAIL_LOOP_RESULT {json}'.
do $test$
declare
  u_eng uuid := gen_random_uuid(); u_op uuid := gen_random_uuid(); u_view uuid := gen_random_uuid();
  org uuid; site uuid; m1 uuid; m2 uuid; rec uuid; rv uuid; tgt uuid; p1 uuid; p2 uuid; p_other uuid;
  r1 uuid; r0 uuid; r2 uuid; s1 uuid; s2 uuid; v_fail uuid; v_inc uuid; v_pass uuid; v_fail2 uuid;
  cs uuid; cs2 uuid; qa_a uuid; qa0 uuid; qa1 uuid; qa2 uuid; qa_x uuid; sn_a uuid; sn1 uuid; sn2 uuid; sn_x uuid;
  d1 uuid; d2 uuid; d_old uuid; au_r1 uuid; au uuid;
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
  checks := checks + 1;
  begin perform public.record_product_verification(r1); failures := failures || '{"check":"operator cannot verify","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','operator cannot verify','msg',sqlerrm); end if; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_eng, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- product verification computed by the database (same rules as productCheck)
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

  -- ROZPAD I
  checks := checks + 1;
  begin perform public.open_fail_case(v_inc); failures := failures || '{"check":"open from non-FAIL refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_not_failed%' then failures := failures || jsonb_build_object('check','open from non-FAIL refused','msg',sqlerrm); end if; end;
  cs := public.open_fail_case(v_fail);
  checks := checks + 1;
  begin perform public.open_fail_case(v_fail); failures := failures || '{"check":"one case per verification","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;
  if (select jsonb_agg(i ->> 'parameter' order by i ->> 'parameter') from public.fail_case_steps s, jsonb_array_elements(s.payload -> 'items') i
      where s.case_id = cs and s.seq = 1 and s.step = 'DECOMPOSITION') <> '["density","hardness","moisture"]'::jsonb then
    failures := failures || '{"check":"ROZPAD I lists every item","detail":"wrong"}';
  end if;
  checks := checks + 1;
  begin insert into public.fail_case_steps (organization_id, case_id, seq, step) values (org, cs, 9, 'AUDIT');
    failures := failures || '{"check":"direct step insert refused","detail":"accepted"}';
  exception when others then null; end;

  -- SZCZEGÓŁOWA DIAGNOZA comes before 3
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'VALID') returning id into qa_a;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'EXTRACT', qa_a, '{}'); failures := failures || '{"check":"3 before diagnosis refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_order%' then failures := failures || jsonb_build_object('check','3 before diagnosis refused','msg',sqlerrm); end if; end;
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256) values (org, r1, qa_a, 'v1', '{}', repeat('a', 64)) returning id into sn_a;
  checks := checks + 1;
  begin insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates, cause_category, confidence_label)
    values (org, r1, sn_a, 'gates-v0', 'DIAGNOSED', pass_gates, 'CONFIGURATION_MISMATCH', 'LOW');
    failures := failures || '{"check":"user DIAGNOSED refused","detail":"accepted"}';
  exception when others then if sqlstate <> '42501' then failures := failures || jsonb_build_object('check','user DIAGNOSED refused','msg',sqlerrm); end if; end;
  insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates)
    values (org, r1, sn_a, 'gates-v0', 'INSUFFICIENT_DATA', '[{"id":"MACHINE_STABLE","status":"UNKNOWN"}]') returning id into d1;
  perform public.record_fail_step(cs, 'DIAGNOSIS', d1, '{"note":"first look on the raw state"}');

  -- 3 EXTRACT: correct vs erroneous
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r0, 'v0', 'VALID') returning id into qa0;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'EXTRACT', qa0, '{}'); failures := failures || '{"check":"assessment of another run refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','assessment of another run refused','msg',sqlerrm); end if; end;
  reset role;
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'QUARANTINED') returning id into qa1;
  insert into public.quality_signal_results (organization_id, assessment_id, signal, verdict, reasons, valid_samples, quarantined_samples)
    values (org, qa1, 'melt_temp', 'QUARANTINED', array['SPIKE']::quality_reason[], 40, 2),
           (org, qa1, 'pressure', 'VALID', '{}', 42, 0);
  set local role authenticated;
  perform public.record_fail_step(cs, 'EXTRACT', qa1, '{}');
  select payload into x from public.fail_case_steps where case_id = cs and step = 'EXTRACT';
  checks := checks + 1;
  if x -> 'product_correct' <> '["density"]' or x -> 'product_erroneous' <> '["hardness","moisture"]'
     or (select jsonb_agg(e ->> 'signal') from jsonb_array_elements(x -> 'data_erroneous') e) <> '["melt_temp"]'
     or jsonb_array_length(x -> 'data_correct') <> 2 then
    failures := failures || jsonb_build_object('check', '3 separates correct from erroneous', 'got', x);
  end if;

  -- 6 PURGE: recorded exclusion, raw data untouched
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'PURGE', qa1, '{}'); failures := failures || '{"check":"6 takes no reference","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','6 takes no reference','msg',sqlerrm); end if; end;
  perform public.record_fail_step(cs, 'PURGE', null, '{}');
  checks := checks + 1;
  if (select payload ->> 'rejected_plan_id' from public.fail_case_steps where case_id = cs and step = 'PURGE') is distinct from p1::text
     or (select count(*) from public.product_measurements pm join public.product_samples ps on ps.id = pm.product_sample_id where ps.run_id = r1) <> 3 then
    failures := failures || '{"check":"6 rejects the failed plan and deletes nothing","detail":"wrong"}';
  end if;

  -- 28 CONSOLIDATE: a snapshot built from 3's assessment
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'VALID') returning id into qa_x;
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256) values (org, r1, qa_x, 'v1', '{}', repeat('d', 64)) returning id into sn_x;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'CONSOLIDATE', sn_x, '{}'); failures := failures || '{"check":"28 from another assessment refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','28 from another assessment refused','msg',sqlerrm); end if; end;
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256)
    values (org, r1, qa1, 'v1', '{"totals":{"samples":84,"cleanSamples":82,"quarantinedSamples":2}}', repeat('b', 64)) returning id into sn1;
  perform public.record_fail_step(cs, 'CONSOLIDATE', sn1, '{}');
  perform public.record_fail_step(cs, 'STATE_REFRESH', null, '{}');

  -- no named cause -> no repair; diagnose again on the base state from 28
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', null, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}],"note":"x"}');
    failures := failures || '{"check":"repair without a named cause refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_order%' then failures := failures || jsonb_build_object('check','repair without a named cause refused','msg',sqlerrm); end if; end;
  insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates)
    values (org, r1, sn_a, 'gates-v0', 'INCONCLUSIVE', '[{"id":"MACHINE_STABLE","status":"UNKNOWN"}]') returning id into d_old;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'DIAGNOSIS', d_old, '{}'); failures := failures || '{"check":"re-diagnosis must be of the base state","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','re-diagnosis must be of the base state','msg',sqlerrm); end if; end;
  reset role;
  insert into public.diagnoses (organization_id, run_id, snapshot_id, gates_version, status, gates, cause_category, confidence_label)
    values (org, r1, sn1, 'gates-v0', 'DIAGNOSED', pass_gates, 'CONFIGURATION_MISMATCH', 'LOW') returning id into d2;  -- the engine names a cause
  set local role authenticated;
  perform public.record_fail_step(cs, 'DIAGNOSIS', d2, '{}');
  -- second cycle 3 -> 6 -> 28 -> ODŚWIEŻENIE
  insert into public.quality_assessments (organization_id, run_id, ruleset_version, verdict) values (org, r1, 'v0', 'VALID') returning id into qa2;
  perform public.record_fail_step(cs, 'EXTRACT', qa2, '{}');
  perform public.record_fail_step(cs, 'PURGE', null, '{}');
  insert into public.state_snapshots (organization_id, run_id, quality_assessment_id, schema_version, snapshot, sha256) values (org, r1, qa2, 'v1', '{}', repeat('c', 64)) returning id into sn2;
  perform public.record_fail_step(cs, 'CONSOLIDATE', sn2, '{}');
  perform public.record_fail_step(cs, 'STATE_REFRESH', null, '{}');

  -- NAPRAWA: a new plan for the same machine, with changes and a rationale
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', p1, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}],"note":"x"}');
    failures := failures || '{"check":"the failed plan is not a repair","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','the failed plan is not a repair','msg',sqlerrm); end if; end;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, product_target_id) values (org, rv, m2, tgt) returning id into p_other;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', p_other, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}],"note":"x"}');
    failures := failures || '{"check":"plan of another machine refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','plan of another machine refused','msg',sqlerrm); end if; end;
  insert into public.process_plans (organization_id, recipe_version_id, machine_id, product_target_id, water_kg_h) values (org, rv, m1, tgt, 12) returning id into p2;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'INTERVENTION', p2, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12}]}');
    failures := failures || '{"check":"repair without rationale refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_payload%' then failures := failures || jsonb_build_object('check','repair without rationale refused','msg',sqlerrm); end if; end;
  perform public.record_fail_step(cs, 'INTERVENTION', p2, '{"changes":[{"parameter":"water_kg_h","from":10,"to":12,"unit":"kg/h"}],"note":"more water to lower moisture"}');

  -- CONTROLLED TEST (approval chain from 0014 applies)
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

  -- WERYFIKACJA -> RAPORT
  insert into public.product_samples (organization_id, run_id, sample_code) values (org, r2, 'S2') returning id into s2;
  insert into public.product_measurements (organization_id, product_sample_id, parameter, value, unit) values
    (org, s2, 'moisture', 6.5, '%'), (org, s2, 'density', 430, 'g/l'), (org, s2, 'hardness', 1.4, 'N');
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'VERIFICATION', v_fail, '{}'); failures := failures || '{"check":"verification of another run refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','verification of another run refused','msg',sqlerrm); end if; end;
  v_pass := public.record_product_verification(r2);
  perform public.record_fail_step(cs, 'VERIFICATION', v_pass, '{}');
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'FILTER', null, '{}'); failures := failures || '{"check":"38 before RAPORT refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_order%' then failures := failures || jsonb_build_object('check','38 before RAPORT refused','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin perform public.close_fail_case(cs, 'no'); failures := failures || '{"check":"no closing without RAPORT after verification","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_order%' then failures := failures || jsonb_build_object('check','no closing without RAPORT after verification','msg',sqlerrm); end if; end;
  perform public.record_fail_step(cs, 'REPORT', null, '{"note":"moisture back in range"}');

  -- 38 FILTR: only what was erroneous in 3 and is now a verified PASS
  perform public.record_fail_step(cs, 'FILTER', null, '{}');
  checks := checks + 1;
  if (select jsonb_agg(p ->> 'parameter' order by p ->> 'parameter') from public.fail_case_steps s, jsonb_array_elements(s.payload -> 'passed') p
      where s.case_id = cs and s.step = 'FILTER') <> '["hardness","moisture"]'::jsonb then
    failures := failures || '{"check":"38 passes the repaired items only","detail":"wrong"}';
  end if;

  -- 39 VERIFY + PERSIST: re-checks current measurements (a new bad one blocks it)
  checks := checks + 1;
  begin
    insert into public.product_measurements (organization_id, product_sample_id, parameter, value, unit) values (org, s2, 'moisture', 9.5, '%');
    perform public.record_fail_step(cs, 'VERIFY_PERSIST', null, '{}');
    failures := failures || '{"check":"39 re-check catches a new failing measurement","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_verify%' then failures := failures || jsonb_build_object('check','39 re-check catches a new failing measurement','msg',sqlerrm); end if; end;
  perform public.record_fail_step(cs, 'VERIFY_PERSIST', null, '{}');
  checks := checks + 1;
  if (select jsonb_array_length(content -> 'passed') from public.knowledge_entries where case_id = cs) is distinct from 2 then
    failures := failures || '{"check":"39 persisted the filtered knowledge","detail":"missing"}';
  end if;

  -- 40 LOCK, CROSS
  perform public.record_fail_step(cs, 'LOCK', null, '{}');
  reset role;
  checks := checks + 1;
  begin update public.fail_cases set outcome = 'VERIFIED_FAIL' where id = cs; failures := failures || '{"check":"locked case is read-only","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_locked%' then failures := failures || jsonb_build_object('check','locked case is read-only','msg',sqlerrm); end if; end;
  set local role authenticated;
  perform public.record_fail_step(cs, 'CROSS', null, '{}');

  -- AUDIT: a seal of the controlled test run made after CROSS, containing the case (audit-v3)
  au_r1 := public.seal_run_audit(r1);
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'AUDIT', au_r1, '{}'); failures := failures || '{"check":"seal of another run refused","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_ref%' then failures := failures || jsonb_build_object('check','seal of another run refused','msg',sqlerrm); end if; end;
  au := public.seal_run_audit(r2);
  checks := checks + 1;
  if (select snapshot ->> 'schema' from public.audit_records where id = au) <> 'audit-v3' then
    failures := failures || '{"check":"seal is audit-v3","detail":"wrong schema"}';
  end if;
  perform public.record_fail_step(cs, 'AUDIT', au, '{}');
  checks := checks + 1;
  if (select jsonb_build_array(status, outcome, outcome_evidence_saved, locked_at is not null) from public.fail_cases where id = cs)
     <> '["CLOSED","VERIFIED_PASS",true,true]'::jsonb then
    failures := failures || jsonb_build_object('check', 'case closed after AUDIT', 'got', (select to_jsonb(f) from public.fail_cases f where id = cs));
  end if;
  checks := checks + 1;
  select count(*) into n from public.fail_case_steps where case_id = cs;
  if n <> 20 then failures := failures || jsonb_build_object('check', 'all 20 steps kept (two cycles)', 'steps', n); end if;
  checks := checks + 1;
  begin perform public.record_fail_step(cs, 'CROSS', null, '{}'); failures := failures || '{"check":"closed case refuses steps","detail":"accepted"}';
  exception when others then if sqlerrm not like 'fail_closed%' then failures := failures || jsonb_build_object('check','closed case refuses steps','msg',sqlerrm); end if; end;

  -- a case closed without verification never becomes knowledge
  v_fail2 := public.record_product_verification(r1);
  cs2 := public.open_fail_case(v_fail2);
  checks := checks + 1;
  begin perform public.close_fail_case(cs2, '  '); failures := failures || '{"check":"closing needs a reason","detail":"accepted"}';
  exception when others then null; end;
  perform public.close_fail_case(cs2, 'raw material batch no longer available');
  reset role;
  checks := checks + 1;
  begin insert into public.knowledge_entries (organization_id, case_id, content) values (org, cs2, '{}');
    failures := failures || '{"check":"owner cannot force knowledge","detail":"accepted"}';
  exception when others then if sqlerrm not like 'knowledge_refused%' then failures := failures || jsonb_build_object('check','owner cannot force knowledge','msg',sqlerrm); end if; end;
  checks := checks + 1;
  begin update public.fail_case_steps set payload = '{}' where case_id = cs; failures := failures || '{"check":"steps immutable","detail":"accepted"}';
  exception when others then null; end;
  checks := checks + 1;
  begin delete from public.knowledge_entries where case_id = cs; failures := failures || '{"check":"knowledge immutable","detail":"accepted"}';
  exception when others then null; end;

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
  if n <> 20 then failures := failures || jsonb_build_object('check', 'viewer reads the loop', 'rows', n); end if;
  reset role;

  raise exception 'FAIL_LOOP_RESULT %', jsonb_build_object('checks', checks, 'failures', failures,
    'verdict', case when jsonb_array_length(failures) = 0 then 'PASS' else 'FAIL' end);
end
$test$;
