-- mogging: shared goals you chase together, plus a daily journal and mood.
-- Run after 20260805000000_allowlist_trim.sql.

-- ============================================================================
-- SHARED GOALS
--
-- Everything so far belongs to one person. This is the first thing that
-- belongs to the couple: one target ("save $1000"), either of you can put
-- something toward it, and progress is the sum of what you've both put in.
-- ============================================================================

create table if not exists public.shared_goals (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  emoji text not null default '🤝',
  color text not null default '#8b5cf6',
  target_value numeric not null check (target_value > 0),
  unit text,
  -- 'money' renders as $1,000 rather than "1000 $". Same idea as the
  -- value_format on benchmarks, where time needed its own rendering.
  value_format text not null default 'number' check (value_format in ('number', 'money')),
  difficulty text not null default 'medium'
    check (difficulty in ('trivial', 'easy', 'medium', 'hard')),
  is_active boolean not null default true,
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists shared_goals_couple_idx on public.shared_goals (couple_id);

create table if not exists public.shared_goal_entries (
  id uuid primary key default gen_random_uuid(),
  shared_goal_id uuid not null references public.shared_goals (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric not null,
  note text,
  recorded_on date not null default current_date,
  -- Bonus rows are written by the trigger when the target is reached, one per
  -- partner, so finishing together pays both of you. They carry points but no
  -- amount, so they never move the progress bar.
  is_bonus boolean not null default false,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists shared_goal_entries_goal_idx
  on public.shared_goal_entries (shared_goal_id);

alter table public.shared_goals enable row level security;
alter table public.shared_goal_entries enable row level security;

-- Both partners get full control. A shared goal that only its author could
-- edit would not be shared in any meaningful sense.
drop policy if exists shared_goals_select on public.shared_goals;
create policy shared_goals_select on public.shared_goals
  for select using (
    couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  );

drop policy if exists shared_goals_insert on public.shared_goals;
create policy shared_goals_insert on public.shared_goals
  for insert with check (
    created_by = auth.uid()
    and couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  );

drop policy if exists shared_goals_update on public.shared_goals;
create policy shared_goals_update on public.shared_goals
  for update using (
    couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  ) with check (
    couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  );

drop policy if exists shared_goals_delete on public.shared_goals;
create policy shared_goals_delete on public.shared_goals
  for delete using (
    couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  );

drop policy if exists shared_goal_entries_select on public.shared_goal_entries;
create policy shared_goal_entries_select on public.shared_goal_entries
  for select using (
    shared_goal_id in (
      select id from shared_goals
      where couple_id in (select couple_id from couple_members where profile_id = auth.uid())
    )
  );

-- You may only log your OWN contributions, even though you can both see and
-- edit the goal itself.
drop policy if exists shared_goal_entries_insert on public.shared_goal_entries;
create policy shared_goal_entries_insert on public.shared_goal_entries
  for insert with check (
    owner_id = auth.uid()
    and shared_goal_id in (
      select id from shared_goals
      where couple_id in (select couple_id from couple_members where profile_id = auth.uid())
    )
  );

drop policy if exists shared_goal_entries_delete on public.shared_goal_entries;
create policy shared_goal_entries_delete on public.shared_goal_entries
  for delete using (owner_id = auth.uid());

-- Points for a contribution are proportional to how much of the target it
-- covers, so putting in $100 of $1000 earns a tenth of the goal's value. The
-- same principle as counter goals, which is what keeps the whole points
-- system feeling consistent.
create or replace function public.shared_goal_entries_set_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g shared_goals%rowtype;
  full_value integer;
begin
  if new.is_bonus then
    return new;
  end if;

  select * into g from shared_goals where id = new.shared_goal_id;
  if not found or g.target_value <= 0 then
    new.points_awarded := 0;
    return new;
  end if;

  full_value := public.calc_points(g.difficulty, 'checkbox', null, null, true);
  new.points_awarded := greatest(
    0,
    round(full_value * least(abs(new.amount), g.target_value) / g.target_value)
  )::integer;

  return new;
end;
$$;

drop trigger if exists shared_goal_entries_points_trigger on public.shared_goal_entries;
create trigger shared_goal_entries_points_trigger
  before insert or update on public.shared_goal_entries
  for each row execute function public.shared_goal_entries_set_points();

-- Contributions roll into profiles.points_total through the same delta
-- trigger every other scoring table uses. It only needs owner_id and
-- points_awarded, both of which this table has.
drop trigger if exists shared_goal_entries_bump_points_trigger on public.shared_goal_entries;
create trigger shared_goal_entries_bump_points_trigger
  after insert or update or delete on public.shared_goal_entries
  for each row execute function public.bump_profile_points();

-- Derives achievement from the entries, so deleting a mis-logged contribution
-- rolls the whole thing back, bonuses included. Same approach as benchmarks.
create or replace function public.refresh_shared_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g shared_goals%rowtype;
  total numeric;
  full_value integer;
  member record;
begin
  select * into g from shared_goals where id = p_goal_id;
  if not found then
    return;
  end if;

  select coalesce(sum(amount), 0) into total
  from shared_goal_entries
  where shared_goal_id = p_goal_id and not is_bonus;

  if total >= g.target_value and g.achieved_at is null then
    update shared_goals set achieved_at = now() where id = p_goal_id;

    -- Reaching it together pays both of you, not whoever happened to log the
    -- contribution that crossed the line.
    full_value := public.calc_points(g.difficulty, 'checkbox', null, null, true);
    for member in
      select profile_id from couple_members where couple_id = g.couple_id
    loop
      insert into shared_goal_entries
        (shared_goal_id, owner_id, amount, note, is_bonus, points_awarded)
      values (p_goal_id, member.profile_id, 0, 'Reached together', true, full_value);
    end loop;

  elsif total < g.target_value and g.achieved_at is not null then
    update shared_goals set achieved_at = null where id = p_goal_id;
    delete from shared_goal_entries where shared_goal_id = p_goal_id and is_bonus;
  end if;
end;
$$;

create or replace function public.shared_goal_entries_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bonus rows are written BY refresh_shared_goal; reacting to them would
  -- recurse.
  if coalesce(new.is_bonus, old.is_bonus, false) then
    return coalesce(new, old);
  end if;

  perform public.refresh_shared_goal(coalesce(new.shared_goal_id, old.shared_goal_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists shared_goal_entries_refresh_trigger on public.shared_goal_entries;
create trigger shared_goal_entries_refresh_trigger
  after insert or update or delete on public.shared_goal_entries
  for each row execute function public.shared_goal_entries_after_change();

-- ============================================================================
-- JOURNAL AND MOOD
--
-- One entry per person per day. visibility is here from the start even though
-- it defaults to shared, so changing your mind later is a toggle rather than
-- a migration and a conversation about what the other person already read.
-- ============================================================================

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null,
  body text,
  mood smallint check (mood between 1 and 5),
  visibility text not null default 'shared' check (visibility in ('shared', 'private')),
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, entry_date)
);

create index if not exists journal_entries_owner_date_idx
  on public.journal_entries (owner_id, entry_date);

alter table public.journal_entries enable row level security;

drop policy if exists journal_entries_select on public.journal_entries;
create policy journal_entries_select on public.journal_entries
  for select using (
    owner_id = auth.uid()
    or (visibility = 'shared' and same_couple(owner_id))
  );

drop policy if exists journal_entries_insert on public.journal_entries;
create policy journal_entries_insert on public.journal_entries
  for insert with check (owner_id = auth.uid());

drop policy if exists journal_entries_update on public.journal_entries;
create policy journal_entries_update on public.journal_entries
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists journal_entries_delete on public.journal_entries;
create policy journal_entries_delete on public.journal_entries
  for delete using (owner_id = auth.uid());

-- A small, fixed reward for showing up: enough to count, not enough to make
-- one-word entries worth farming.
create or replace function public.journal_entries_set_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.points_awarded := case
    when coalesce(length(trim(new.body)), 0) >= 20 or new.mood is not null then 3
    else 0
  end;
  return new;
end;
$$;

drop trigger if exists journal_entries_points_trigger on public.journal_entries;
create trigger journal_entries_points_trigger
  before insert or update on public.journal_entries
  for each row execute function public.journal_entries_set_points();

drop trigger if exists journal_entries_bump_points_trigger on public.journal_entries;
create trigger journal_entries_bump_points_trigger
  after insert or update or delete on public.journal_entries
  for each row execute function public.bump_profile_points();
