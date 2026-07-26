-- mogging: benchmarks — target-based outcome goals ("run a sub-7:30 mile",
-- "bench 225", "get under 180 lbs"), optionally tied to the daily habit
-- goal that drives them.
--
-- Distinct from goals: a goal is something you do repeatedly (and is
-- scored per-day), a benchmark is a number you're moving toward and log
-- occasionally. Run this after 20260728000000_points_stats.sql.

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.benchmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- The habit that moves this number. Optional: a benchmark can stand alone.
  goal_id uuid references public.goals (id) on delete set null,
  title text not null,
  emoji text not null default '🎯',
  color text not null default '#22c55e',
  unit text,
  -- 'higher': bigger is better (bench press, pull-ups).
  -- 'lower':  smaller is better (mile time, body weight).
  direction text not null default 'higher' check (direction in ('higher', 'lower')),
  -- 'time' values are stored as SECONDS and rendered as mm:ss by the client,
  -- so "sub 7:30" is target_value 450 rather than an awkward 7.5.
  value_format text not null default 'number' check (value_format in ('number', 'time')),
  start_value numeric,
  target_value numeric not null,
  best_value numeric,
  difficulty text not null default 'medium' check (difficulty in ('trivial', 'easy', 'medium', 'hard')),
  visibility text not null default 'private' check (visibility in ('shared', 'private')),
  is_active boolean not null default true,
  achieved_at timestamptz,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index benchmarks_owner_idx on public.benchmarks (owner_id);
create index benchmarks_goal_idx on public.benchmarks (goal_id);

create table public.benchmark_entries (
  id uuid primary key default gen_random_uuid(),
  benchmark_id uuid not null references public.benchmarks (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  value numeric not null,
  recorded_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index benchmark_entries_benchmark_idx on public.benchmark_entries (benchmark_id, recorded_on);

-- ============================================================================
-- ROW LEVEL SECURITY (mirrors the goals/goal_logs rules from Phase 2)
-- ============================================================================

alter table public.benchmarks enable row level security;
alter table public.benchmark_entries enable row level security;

create policy benchmarks_select on public.benchmarks
  for select using (
    owner_id = auth.uid()
    or (visibility = 'shared' and same_couple(owner_id))
  );

create policy benchmarks_insert on public.benchmarks
  for insert with check (
    owner_id = auth.uid()
    and couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  );

create policy benchmarks_update on public.benchmarks
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy benchmarks_delete on public.benchmarks
  for delete using (owner_id = auth.uid());

create policy benchmark_entries_select on public.benchmark_entries
  for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from benchmarks b
      where b.id = benchmark_entries.benchmark_id
        and b.visibility = 'shared'
        and same_couple(b.owner_id)
    )
  );

create policy benchmark_entries_insert on public.benchmark_entries
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from benchmarks b where b.id = benchmark_id and b.owner_id = auth.uid())
  );

create policy benchmark_entries_update on public.benchmark_entries
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy benchmark_entries_delete on public.benchmark_entries
  for delete using (owner_id = auth.uid());

-- ============================================================================
-- PROGRESS + ACHIEVEMENT
--
-- best_value / achieved_at / points_awarded are derived from the entries,
-- recomputed on every entry write, so deleting a mistaken entry correctly
-- rolls the benchmark (and the points) back.
-- ============================================================================

create or replace function public.refresh_benchmark(p_benchmark_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b benchmarks%rowtype;
  new_best numeric;
  first_value numeric;
  reached boolean;
  milestone integer;
begin
  select * into b from benchmarks where id = p_benchmark_id;
  if not found then
    return;
  end if;

  if b.direction = 'lower' then
    select min(value) into new_best from benchmark_entries where benchmark_id = p_benchmark_id;
  else
    select max(value) into new_best from benchmark_entries where benchmark_id = p_benchmark_id;
  end if;

  -- If no explicit starting point was given, treat the earliest logged
  -- measurement as the baseline so progress has something to measure from.
  if b.start_value is null then
    select value into first_value
    from benchmark_entries
    where benchmark_id = p_benchmark_id
    order by recorded_on asc, created_at asc
    limit 1;
  end if;

  reached := new_best is not null and (
    (b.direction = 'lower' and new_best <= b.target_value)
    or (b.direction = 'higher' and new_best >= b.target_value)
  );

  -- A milestone is worth 5x a daily completion of the same difficulty.
  milestone := public.calc_points(b.difficulty, 'checkbox', null, null, true) * 5;

  update benchmarks
  set best_value = new_best,
      start_value = coalesce(start_value, first_value),
      achieved_at = case
        when reached then coalesce(achieved_at, now())
        else null
      end,
      points_awarded = case when reached then milestone else 0 end
  where id = p_benchmark_id;
end;
$$;

create or replace function public.benchmark_entries_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_benchmark(coalesce(new.benchmark_id, old.benchmark_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists benchmark_entries_refresh_trigger on public.benchmark_entries;
create trigger benchmark_entries_refresh_trigger
  after insert or update or delete on public.benchmark_entries
  for each row execute function public.benchmark_entries_refresh();

-- Changing the target (or direction/difficulty) re-evaluates whether the
-- benchmark is still met, and re-prices the milestone.
create or replace function public.benchmarks_reevaluate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.target_value is distinct from old.target_value
     or new.direction is distinct from old.direction
     or new.difficulty is distinct from old.difficulty then
    perform public.refresh_benchmark(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists benchmarks_reevaluate_trigger on public.benchmarks;
create trigger benchmarks_reevaluate_trigger
  after update on public.benchmarks
  for each row execute function public.benchmarks_reevaluate();

-- benchmarks has owner_id + points_awarded, the two columns
-- bump_profile_points reads, so the existing function works unchanged.
drop trigger if exists benchmarks_bump_points_trigger on public.benchmarks;
create trigger benchmarks_bump_points_trigger
  after insert or update or delete on public.benchmarks
  for each row execute function public.bump_profile_points();

-- ============================================================================
-- POINTS AGGREGATION
--
-- Benchmarks become a third points source alongside tasks and goal_logs,
-- counted on the day they were achieved.
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
    union all
    select achieved_at::date as event_date, points_awarded as pts
      from benchmarks where owner_id = p_profile_id and achieved_at is not null
  ) e on e.event_date = gs.d::date
  group by gs.d
  order by gs.d;
end;
$$;

revoke execute on function public.points_history(uuid, integer) from public;
grant execute on function public.points_history(uuid, integer) to authenticated;

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
    'best_streak', best_streak
  ) into result;

  return result;
end;
$$;

revoke execute on function public.points_summary(uuid) from public;
grant execute on function public.points_summary(uuid) to authenticated;

-- Resync including the new source.
update public.profiles p
set points_total = coalesce(
  (
    select sum(points_awarded) from (
      select points_awarded from public.tasks where owner_id = p.id
      union all
      select points_awarded from public.goal_logs where owner_id = p.id
      union all
      select points_awarded from public.benchmarks where owner_id = p.id
    ) x
  ),
  0
);

update public.profiles set current_level = level_for_points(points_total);
