-- mogging: multiple daily reminders, and parent goals that cross themselves
-- off once every task linked to them is done.
-- Run after 20260802000000_points_records.sql.

-- ============================================================================
-- 1. Multiple daily reminders
--
-- user_settings.daily_reminder_time held exactly one time. A reminder per row
-- lets you set as many as you want, and each row carries its own last_sent_on
-- so "once per local day" is tracked per reminder rather than per person.
-- ============================================================================

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  at time not null,
  label text,
  is_active boolean not null default true,
  -- Local date this reminder last fired on, in the owner's timezone.
  last_sent_on date,
  created_at timestamptz not null default now(),
  unique (profile_id, at)
);

create index if not exists reminders_profile_idx on public.reminders (profile_id);

alter table public.reminders enable row level security;

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own on public.reminders
  for select using (profile_id = auth.uid());

drop policy if exists reminders_insert_own on public.reminders;
create policy reminders_insert_own on public.reminders
  for insert with check (profile_id = auth.uid());

drop policy if exists reminders_update_own on public.reminders;
create policy reminders_update_own on public.reminders
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists reminders_delete_own on public.reminders;
create policy reminders_delete_own on public.reminders
  for delete using (profile_id = auth.uid());

-- Cap the number of reminders in a trigger rather than in the UI, so the
-- limit holds no matter what writes to the table.
create or replace function public.reminders_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing integer;
begin
  if tg_op = 'INSERT' then
    select count(*) into existing from reminders where profile_id = new.profile_id;
    if existing >= 6 then
      raise exception 'You can have up to 6 reminders a day';
    end if;
  end if;

  -- Moving a reminder to a new time clears the "already sent today" mark, so
  -- pulling a reminder earlier in the day can still fire today instead of
  -- silently waiting until tomorrow.
  if tg_op = 'UPDATE' and new.at is distinct from old.at then
    new.last_sent_on := null;
  end if;

  return new;
end;
$$;

drop trigger if exists reminders_before_write_trg on public.reminders;
create trigger reminders_before_write_trg
  before insert or update on public.reminders
  for each row execute function public.reminders_before_write();

-- Carry over whatever single reminder time people already had, so nobody
-- silently loses the reminder they were relying on.
insert into public.reminders (profile_id, at, last_sent_on)
select s.profile_id, s.daily_reminder_time, s.last_reminder_on
from public.user_settings s
where s.daily_reminder_time is not null
on conflict (profile_id, at) do nothing;

-- user_settings.daily_reminder_time and .last_reminder_on are deliberately
-- left in place rather than dropped: nothing reads them any more, and keeping
-- them means re-running this file is harmless.

-- ============================================================================
-- 2. Parent goals complete when all their linked tasks are done
--
-- Previously the client marked a goal complete the moment ANY task linked to
-- it was ticked. With the AI planner splitting one goal into several tasks a
-- day, that was wrong: "get stronger" was done after the first set.
--
-- Doing it in a trigger rather than the client means it holds for every write
-- path — the app, the planner, a manual edit — and it stays correct when a
-- task is added or deleted partway through the day.
-- ============================================================================

create or replace function public.sync_goal_log_from_tasks(
  p_owner uuid,
  p_goal uuid,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer;
  done_count integer;
begin
  if p_goal is null or p_owner is null or p_date is null then
    return;
  end if;

  -- Counter goals track progress through their own count, not through tasks.
  if not exists (select 1 from goals where id = p_goal and kind = 'checkbox') then
    return;
  end if;

  select count(*), count(*) filter (where done)
    into total, done_count
  from tasks
  where owner_id = p_owner and goal_id = p_goal and task_date = p_date;

  if total = 0 then
    -- No linked tasks for that day: leave any manual entry (e.g. one ticked
    -- from the year grid) exactly as the person left it.
    return;
  end if;

  if done_count = total then
    insert into goal_logs (goal_id, owner_id, log_date, completed, count)
    values (p_goal, p_owner, p_date, true, 1)
    on conflict (goal_id, log_date) do update
      set completed = true,
          count = greatest(goal_logs.count, 1);
  else
    -- Only ever downgrade a row that already exists — don't litter the table
    -- with empty rows for every goal on every day.
    update goal_logs
      set completed = false, count = 0
      where goal_id = p_goal and log_date = p_date and completed;
  end if;
end;
$$;

create or replace function public.tasks_sync_goal_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform sync_goal_log_from_tasks(old.owner_id, old.goal_id, old.task_date);
    return old;
  end if;

  perform sync_goal_log_from_tasks(new.owner_id, new.goal_id, new.task_date);

  -- Re-point a task at a different goal and the old goal has to be
  -- re-evaluated too, or it stays stuck as complete.
  if tg_op = 'UPDATE' and (
    old.goal_id is distinct from new.goal_id or old.task_date is distinct from new.task_date
  ) then
    perform sync_goal_log_from_tasks(old.owner_id, old.goal_id, old.task_date);
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_sync_goal_log_trg on public.tasks;
create trigger tasks_sync_goal_log_trg
  after insert or update or delete on public.tasks
  for each row execute function public.tasks_sync_goal_log();

-- Repair pass: fix goals that the old any-task-wins behaviour marked complete
-- on days where tasks were actually left unfinished.
do $$
declare
  r record;
begin
  for r in
    select distinct owner_id, goal_id, task_date
    from tasks
    where goal_id is not null
      and task_date > current_date - 400
  loop
    perform public.sync_goal_log_from_tasks(r.owner_id, r.goal_id, r.task_date);
  end loop;
end;
$$;
