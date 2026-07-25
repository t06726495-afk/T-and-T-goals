-- mogging: basic points calculation for tasks and goal_logs.
-- Run this in the Supabase SQL Editor after the Phase 2 migration.
--
-- This covers only per-completion scoring (Habitica-style difficulty
-- multipliers). Streak bonuses, levels, and profiles.points_total
-- aggregation land in the Phase 5 migration.

create or replace function public.calc_points(
  p_difficulty text,
  p_kind text,
  p_target integer,
  p_count integer,
  p_completed boolean
)
returns integer
language plpgsql
immutable
as $$
declare
  multiplier numeric;
  base constant numeric := 10;
  full_value integer;
  progress integer;
  bonus integer;
begin
  multiplier := case p_difficulty
    when 'trivial' then 0.1
    when 'easy' then 1
    when 'medium' then 1.5
    when 'hard' then 2
    else 1
  end;

  full_value := round(base * multiplier);

  if p_kind = 'checkbox' then
    return case when p_completed then full_value else 0 end;
  end if;

  -- counter
  if p_target is null or p_target <= 0 then
    return 0;
  end if;

  progress := round(full_value::numeric * least(coalesce(p_count, 0), p_target) / p_target);
  bonus := case when coalesce(p_count, 0) >= p_target then 2 else 0 end;

  return progress + bonus;
end;
$$;

-- tasks: always checkbox-shaped (done/not done).
create or replace function public.tasks_set_points()
returns trigger
language plpgsql
as $$
begin
  new.points_awarded := public.calc_points(new.difficulty, 'checkbox', null, null, new.done);
  new.done_at := case when new.done then coalesce(new.done_at, now()) else null end;
  return new;
end;
$$;

create trigger tasks_set_points_trigger
  before insert or update on public.tasks
  for each row execute function public.tasks_set_points();

-- goal_logs: counter goals score from progress toward target_per_day.
-- Checkbox goals score through their linked task instead (see above) — a
-- goal_logs row for a checkbox goal exists only to feed the Phase 4 year
-- grid, so it intentionally always awards 0 here to avoid double-counting
-- the same real-world completion.
create or replace function public.goal_logs_set_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g goals%rowtype;
begin
  select * into g from goals where id = new.goal_id;

  if g.kind = 'counter' then
    new.points_awarded := public.calc_points(g.difficulty, 'counter', g.target_per_day, new.count, new.completed);
  else
    new.points_awarded := 0;
  end if;

  return new;
end;
$$;

create trigger goal_logs_set_points_trigger
  before insert or update on public.goal_logs
  for each row execute function public.goal_logs_set_points();
