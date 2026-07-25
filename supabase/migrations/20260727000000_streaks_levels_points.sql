-- mogging: streak bonuses, levels, retroactive point recalculation, and
-- privacy-safe aggregate RPCs for the Points screen.
-- Run this in the Supabase SQL Editor after the Phase 3 migration.

-- ============================================================================
-- LEVELS
--
-- Level N requires 50*N*(N+1)/2 cumulative points to REACH (level 1 is the
-- starting level at 0 points; you become level 2 at 50 points, level 3 at
-- 150, etc). Closed-form inverse of that triangular formula.
-- ============================================================================

create or replace function public.level_for_points(p_points integer)
returns integer
language sql
immutable
as $$
  select floor((-5 + sqrt(25 + 4.0 * greatest(p_points, 0))) / 10)::integer + 1;
$$;

-- ============================================================================
-- STREAK BONUS
--
-- +5 points every time a goal's streak (tracked via goal_logs.completed,
-- which is the canonical per-day record for both checkbox and counter
-- goals) crosses a multiple of 7 days. Folded into goal_logs_set_points so
-- it's recomputed fresh on every write rather than accumulated — toggling
-- a day on/off/on can't stack bonuses.
-- ============================================================================

create or replace function public.goal_logs_set_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g goals%rowtype;
  base_points integer;
  streak_len integer := 0;
  bonus integer := 0;
  cursor_date date;
begin
  select * into g from goals where id = new.goal_id;

  if g.kind = 'counter' then
    base_points := public.calc_points(g.difficulty, 'counter', g.target_per_day, new.count, new.completed);
  else
    base_points := 0;
  end if;

  if new.completed then
    -- Start from this row (using NEW directly — it may not be committed/
    -- visible in the table yet), then walk backward through already-
    -- committed prior days.
    streak_len := 1;
    cursor_date := new.log_date - 1;
    loop
      exit when not exists (
        select 1 from goal_logs
        where goal_id = new.goal_id and log_date = cursor_date and completed = true
      );
      streak_len := streak_len + 1;
      cursor_date := cursor_date - 1;
    end loop;

    if streak_len % 7 = 0 then
      bonus := 5;
    end if;
  end if;

  new.points_awarded := base_points + bonus;
  return new;
end;
$$;

-- ============================================================================
-- PROFILE POINT TOTALS
--
-- Keeps profiles.points_total and profiles.current_level in sync with the
-- sum of points_awarded across tasks and goal_logs, via delta rather than
-- a full recompute on every write.
-- ============================================================================

create or replace function public.bump_profile_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer;
  owner uuid;
  new_total integer;
begin
  if tg_op = 'INSERT' then
    delta := new.points_awarded;
    owner := new.owner_id;
  elsif tg_op = 'UPDATE' then
    delta := new.points_awarded - old.points_awarded;
    owner := new.owner_id;
  else
    delta := -old.points_awarded;
    owner := old.owner_id;
  end if;

  if delta <> 0 then
    update profiles
    set points_total = points_total + delta
    where id = owner
    returning points_total into new_total;

    update profiles set current_level = level_for_points(new_total) where id = owner;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger tasks_bump_points_trigger
  after insert or update or delete on public.tasks
  for each row execute function public.bump_profile_points();

create trigger goal_logs_bump_points_trigger
  after insert or update or delete on public.goal_logs
  for each row execute function public.bump_profile_points();

-- ============================================================================
-- RETROACTIVE RECALCULATION
--
-- Editing a goal's difficulty (or a counter goal's target_per_day) touches
-- every historical task/goal_log tied to it, so their BEFORE triggers
-- recompute points_awarded with the new parameters, and the AFTER triggers
-- above roll the resulting deltas into profiles.points_total.
-- ============================================================================

create or replace function public.goals_recalculate_points_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.difficulty is distinct from old.difficulty or new.target_per_day is distinct from old.target_per_day then
    update tasks set difficulty = new.difficulty where goal_id = new.id;
    update goal_logs set count = count where goal_id = new.id;
  end if;
  return new;
end;
$$;

create trigger goals_recalculate_points_trigger
  after update on public.goals
  for each row execute function public.goals_recalculate_points_on_change();

-- One-time backfill so existing Phase 3/4 test data is reflected, since the
-- triggers above only fire on writes from this point forward.
update public.profiles p
set points_total = coalesce(
  (
    select sum(points_awarded) from (
      select points_awarded from public.tasks where owner_id = p.id
      union all
      select points_awarded from public.goal_logs where owner_id = p.id
    ) x
  ),
  0
);

update public.profiles set current_level = level_for_points(points_total);

-- ============================================================================
-- POINTS SCREEN RPCs
--
-- The Points screen shows both partners' totals side by side. profiles.
-- points_total/current_level are already visible between partners (see
-- Phase 2's profiles_select policy), but a per-day breakdown or a streak
-- number computed client-side would only see the other person's SHARED
-- goals (private goal_logs are invisible via RLS), understating their real
-- numbers. These two functions compute the true aggregate server-side
-- (bypassing RLS internally) while never returning any goal-level detail —
-- only a profile owns their own points_total/streak.
-- ============================================================================

create or replace function public.points_this_week(p_profile_id uuid)
returns table(log_date date, points bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id <> auth.uid() and not same_couple(p_profile_id) then
    raise exception 'not authorized';
  end if;

  return query
  select gs.d::date, coalesce(sum(combined.pts), 0)::bigint
  from generate_series((current_date - 6), current_date, interval '1 day') as gs(d)
  left join (
    select task_date as event_date, points_awarded as pts from tasks where owner_id = p_profile_id
    union all
    select log_date as event_date, points_awarded as pts from goal_logs where owner_id = p_profile_id
  ) combined on combined.event_date = gs.d::date
  group by gs.d
  order by gs.d;
end;
$$;

revoke execute on function public.points_this_week(uuid) from public;
grant execute on function public.points_this_week(uuid) to authenticated;

create or replace function public.longest_active_streak(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  best integer := 0;
  g record;
  streak integer;
  cursor_date date;
begin
  if p_profile_id <> auth.uid() and not same_couple(p_profile_id) then
    raise exception 'not authorized';
  end if;

  for g in select id from goals where owner_id = p_profile_id and is_active = true loop
    streak := 0;
    cursor_date := current_date;
    if not exists (
      select 1 from goal_logs where goal_id = g.id and log_date = cursor_date and completed = true
    ) then
      cursor_date := cursor_date - 1;
    end if;
    loop
      exit when not exists (
        select 1 from goal_logs where goal_id = g.id and log_date = cursor_date and completed = true
      );
      streak := streak + 1;
      cursor_date := cursor_date - 1;
    end loop;
    if streak > best then
      best := streak;
    end if;
  end loop;

  return best;
end;
$$;

revoke execute on function public.longest_active_streak(uuid) from public;
grant execute on function public.longest_active_streak(uuid) to authenticated;
