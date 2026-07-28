-- mogging: give counter goals partial credit in the completion percentage.
-- Run after 20260803000000_reminders_and_goal_sync.sql.
--
-- Reading 15 minutes a day against a 30 minute target scored 0%, because the
-- day never reached "completed". Consistently doing half the target is not
-- the same as doing nothing, and showing it as nothing is discouraging in
-- exactly the way this app is meant not to be. Counter goals now contribute
-- min(count / target, 1) per day. Checkbox goals have no partial state and
-- stay all-or-nothing.

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
  longest_active integer := 0;
  completion_pct integer := 0;
  result json;
begin
  if p_profile_id <> auth.uid() and not same_couple(p_profile_id) then
    raise exception 'not authorized';
  end if;

  for g in select id from goals where owner_id = p_profile_id and is_active = true loop
    streak := 0;
    cursor_date := current_date;
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

  with active_days as (
    select distinct d from (
      select task_date as d from tasks where owner_id = p_profile_id and done
      union
      select log_date from goal_logs where owner_id = p_profile_id and completed
      union
      select achieved_at::date from benchmarks
        where owner_id = p_profile_id and achieved_at is not null
    ) x
  ),
  runs as (
    select d, d - (row_number() over (order by d))::integer as grp
    from active_days
  )
  select coalesce(max(cnt), 0) into longest_active
  from (select count(*) as cnt from runs group by grp) counted;

  -- Partial credit for counters, all-or-nothing for checkboxes. Still counted
  -- per goal against the days that goal has existed, so a goal added last
  -- week isn't judged against the whole year.
  with per_goal as (
    select
      greatest(
        0,
        (least(current_date, coalesce(archived_at::date, current_date)) - created_at::date) + 1
      ) as expected,
      (
        select coalesce(sum(
          case
            when goals.kind = 'counter' and coalesce(goals.target_per_day, 0) > 0
              then least(gl.count::numeric / goals.target_per_day, 1)
            when gl.completed then 1
            else 0
          end
        ), 0)
        from goal_logs gl
        where gl.goal_id = goals.id
      ) as done
    from goals
    where owner_id = p_profile_id and is_active = true
  )
  select coalesce(round(100.0 * sum(done) / nullif(sum(expected), 0))::integer, 0)
    into completion_pct
  from per_goal;

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
    union all
    select achieved_at::date,
           points_awarded,
           1
    from benchmarks where owner_id = p_profile_id and achieved_at is not null
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
    'benchmarks_hit', coalesce(
      (select count(*) from benchmarks where owner_id = p_profile_id and achieved_at is not null),
      0
    ),
    'longest_active_days', longest_active,
    'completion_pct', completion_pct,
    'best_streak', best_streak
  ) into result;

  return result;
end;
$$;

revoke execute on function public.points_summary(uuid) from public;
grant execute on function public.points_summary(uuid) to authenticated;
