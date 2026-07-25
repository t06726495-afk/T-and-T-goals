-- mogging: richer points history + summary stats for the Points screen.
-- Run this AFTER 20260727000000_streaks_levels_points.sql.

-- Superseded by points_history(profile, days).
drop function if exists public.points_this_week(uuid);

-- ============================================================================
-- POINTS HISTORY
--
-- Returns one row per day for the last N days (zero-filled, so the chart
-- always has a continuous x-axis even on days with no activity).
-- ============================================================================

create or replace function public.points_history(p_profile_id uuid, p_days integer default 30)
returns table(day date, points bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  span integer := least(greatest(coalesce(p_days, 30), 1), 366);
begin
  if p_profile_id <> auth.uid() and not same_couple(p_profile_id) then
    raise exception 'not authorized';
  end if;

  return query
  select gs.d::date, coalesce(sum(e.pts), 0)::bigint
  from generate_series(current_date - (span - 1), current_date, interval '1 day') as gs(d)
  left join (
    select task_date as event_date, points_awarded as pts from tasks where owner_id = p_profile_id
    union all
    select log_date as event_date, points_awarded as pts from goal_logs where owner_id = p_profile_id
  ) e on e.event_date = gs.d::date
  group by gs.d
  order by gs.d;
end;
$$;

revoke execute on function public.points_history(uuid, integer) from public;
grant execute on function public.points_history(uuid, integer) to authenticated;

-- ============================================================================
-- POINTS SUMMARY
--
-- Every headline stat the Points screen needs, in one round trip. Like the
-- other cross-partner functions this is SECURITY DEFINER so it can see
-- private goals when totalling (otherwise your partner's numbers would be
-- silently understated to only their shared goals) while still returning
-- nothing but aggregates — never which goal any point came from.
--
-- The streak walk is inlined rather than calling longest_active_streak so
-- this function stands on its own.
-- ============================================================================

create or replace function public.points_summary(p_profile_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  best_streak integer := 0;
  streak integer;
  cursor_date date;
  g record;
  result json;
begin
  if p_profile_id <> auth.uid() and not same_couple(p_profile_id) then
    raise exception 'not authorized';
  end if;

  for g in select id from goals where owner_id = p_profile_id and is_active = true loop
    streak := 0;
    cursor_date := current_date;
    -- Not having logged today yet doesn't break a streak; start from
    -- yesterday in that case.
    if not exists (
      select 1 from goal_logs where goal_id = g.id and log_date = cursor_date and completed
    ) then
      cursor_date := cursor_date - 1;
    end if;
    loop
      exit when not exists (
        select 1 from goal_logs where goal_id = g.id and log_date = cursor_date and completed
      );
      streak := streak + 1;
      cursor_date := cursor_date - 1;
    end loop;
    if streak > best_streak then
      best_streak := streak;
    end if;
  end loop;

  with events as (
    select task_date as event_date,
           points_awarded as pts,
           case when done then 1 else 0 end as completions
    from tasks where owner_id = p_profile_id
    union all
    select log_date,
           points_awarded,
           case when completed then 1 else 0 end
    from goal_logs where owner_id = p_profile_id
  ),
  by_day as (
    select event_date,
           sum(pts)::bigint as pts,
           sum(completions)::bigint as completions
    from events
    group by event_date
  )
  select json_build_object(
    'points_today', coalesce((select pts from by_day where event_date = current_date), 0),
    'points_week', coalesce((select sum(pts) from by_day where event_date > current_date - 7), 0),
    'points_prev_week', coalesce(
      (select sum(pts) from by_day
       where event_date > current_date - 14 and event_date <= current_date - 7),
      0
    ),
    'best_day_points', coalesce((select max(pts) from by_day), 0),
    'best_day_date', (select event_date from by_day where pts > 0 order by pts desc, event_date desc limit 1),
    'active_days', coalesce((select count(*) from by_day where pts > 0), 0),
    'total_completions', coalesce((select sum(completions) from by_day), 0),
    'best_streak', best_streak
  ) into result;

  return result;
end;
$$;

revoke execute on function public.points_summary(uuid) from public;
grant execute on function public.points_summary(uuid) to authenticated;

-- ============================================================================
-- RESYNC
--
-- Recomputes every profile's stored total/level from the underlying rows.
-- Safe to re-run at any time — this is the repair hatch if totals ever
-- drift, and it makes this migration self-healing if the Phase 5 backfill
-- didn't take.
-- ============================================================================

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
