-- 0014: DECISION -> APPROVAL -> RUN enforced by the database.
--
-- Runs:
--   * a run is created PLANNED, without start or end time;
--   * PLANNED -> RUNNING needs a linked plan whose engine decision was approved
--     (approve_process_plan), on the same machine, and a start time;
--   * RUNNING -> COMPLETED | ABORTED needs an end time; PLANNED -> ABORTED is
--     allowed (never started); COMPLETED and ABORTED are final;
--   * once started, the run's plan and machine cannot change;
--   * only a PLANNED run can be deleted.
-- Plans:
--   * a plan that is approved or referenced by a run cannot be deleted (the
--     run's link would otherwise be set to NULL silently);
--   * a plan with a started run cannot be changed at all, so its decision and
--     approval stay what the run was started on.
-- Times cannot lie in the future (5 minutes of clock skew allowed).
-- CSV import into a PLANNED run stays possible (historical plant exports);
-- such a run shows RUN as NOT AVAILABLE until it is started on an approved plan.

create or replace function private.tg_run_guard()
returns trigger
language plpgsql
security definer  -- reads the linked plan regardless of the caller's UPDATE policies (FOR SHARE)
set search_path = ''
as $$
declare
  v_machine uuid;
  v_approved timestamptz;
  skew constant interval := interval '5 minutes';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'PLANNED' then
      raise exception 'run_locked: only a PLANNED run can be deleted' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'PLANNED' or new.started_at is not null or new.ended_at is not null then
      raise exception 'run_transition: a run is created as PLANNED without start or end time' using errcode = '23514';
    end if;
  else
    if old.status in ('COMPLETED', 'ABORTED')
       and (new.status, new.started_at, new.ended_at, new.process_plan_id, new.machine_id)
           is distinct from (old.status, old.started_at, old.ended_at, old.process_plan_id, old.machine_id) then
      raise exception 'run_locked: a % run is final', old.status using errcode = '23514';
    end if;
    if old.status <> 'PLANNED'
       and (new.process_plan_id, new.machine_id, new.started_at)
           is distinct from (old.process_plan_id, old.machine_id, old.started_at) then
      raise exception 'run_locked: plan, machine and start time are fixed once the run started' using errcode = '23514';
    end if;
    if not ((old.status = new.status)
            or (old.status = 'PLANNED' and new.status in ('RUNNING', 'ABORTED'))
            or (old.status = 'RUNNING' and new.status in ('COMPLETED', 'ABORTED'))) then
      raise exception 'run_transition: % -> % is not allowed', old.status, new.status using errcode = '23514';
    end if;
  end if;

  -- the linked plan must be on the run's machine
  if new.process_plan_id is not null then
    -- FOR SHARE: a concurrent change that voids the approval waits for this row
    select machine_id, approved_at into v_machine, v_approved
    from public.process_plans where id = new.process_plan_id for share;
    if v_machine is distinct from new.machine_id then
      raise exception 'run_machine: the plan is for another machine' using errcode = '23514';
    end if;
  end if;

  if new.status = 'PLANNED' and (new.started_at is not null or new.ended_at is not null) then
    raise exception 'run_transition: a PLANNED run has no start or end time' using errcode = '23514';
  end if;

  if new.status in ('RUNNING', 'COMPLETED') or (new.status = 'ABORTED' and new.started_at is not null) then
    if new.started_at is null then
      raise exception 'run_transition: a started run needs a start time' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status = 'PLANNED' then
      if new.process_plan_id is null or v_approved is null then
        raise exception 'run_not_approved: a run starts only on an approved plan' using errcode = '23514';
      end if;
      if new.started_at > now() + skew then
        raise exception 'run_time: start time is in the future' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.status = 'RUNNING' and new.ended_at is not null then
    raise exception 'run_transition: a RUNNING run has no end time' using errcode = '23514';
  end if;
  if new.status = 'COMPLETED' or (new.status = 'ABORTED' and new.started_at is not null) then
    if new.ended_at is null then
      raise exception 'run_transition: an ended run needs an end time' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.ended_at is null and new.ended_at > now() + skew then
      raise exception 'run_time: end time is in the future' using errcode = '23514';
    end if;
  end if;
  if new.status = 'ABORTED' and new.started_at is null and new.ended_at is not null then
    raise exception 'run_transition: a run aborted before start has no end time' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger run_guard
before insert or update or delete on public.runs
for each row execute function private.tg_run_guard();

create or replace function private.tg_plan_lock()
returns trigger
language plpgsql
security definer  -- sees every run on the plan, whatever the caller's role
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.approved_at is not null then
      raise exception 'plan_locked: an approved plan cannot be deleted' using errcode = '23514';
    end if;
    if exists (select 1 from public.runs r where r.process_plan_id = old.id) then
      raise exception 'plan_locked: a plan used by a run cannot be deleted' using errcode = '23514';
    end if;
    return old;
  end if;
  if exists (select 1 from public.runs r where r.process_plan_id = old.id and r.status <> 'PLANNED') then
    raise exception 'plan_locked: a run was started on this plan' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger plan_lock
before update or delete on public.process_plans
for each row execute function private.tg_plan_lock();
