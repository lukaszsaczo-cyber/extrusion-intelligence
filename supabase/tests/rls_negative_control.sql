-- Negative control for rls_cross_org.sql: proves the check can fail.
-- Inside a rolled-back block it adds a deliberately leaky SELECT policy on
-- sites and reads as user A. A working isolation test must see org_b_visible=1
-- here. Everything, including the policy, is rolled back by the final RAISE.
do $ctl$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); org_a uuid; org_b uuid; n bigint; own bigint;
begin
  insert into auth.users (id, aud, role, email) values
    (ua, 'authenticated', 'authenticated', 'rls-a-' || ua || '@test.invalid'),
    (ub, 'authenticated', 'authenticated', 'rls-b-' || ub || '@test.invalid');
  insert into public.organizations (name) values ('RLS test A') returning id into org_a;
  insert into public.organization_members (organization_id, user_id, role) values (org_a, ua, 'ADMIN');
  insert into public.organizations (name) values ('RLS test B') returning id into org_b;
  insert into public.organization_members (organization_id, user_id, role) values (org_b, ub, 'ADMIN');
  insert into public.sites (organization_id, name) values (org_a, 'a'), (org_b, 'b');
  execute 'create policy rls_test_leak on public.sites for select to authenticated using (true)';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  set local role authenticated;
  select count(*) into n from public.sites where organization_id = org_b;
  select count(*) into own from public.sites where organization_id = org_a;
  reset role;
  raise exception 'RLS_NEGATIVE_CONTROL %', jsonb_build_object('org_b_visible', n, 'own_visible', own,
    'verdict', case when n > 0 and own > 0 then 'DETECTS_LEAK' else 'BROKEN' end);
end $ctl$;
