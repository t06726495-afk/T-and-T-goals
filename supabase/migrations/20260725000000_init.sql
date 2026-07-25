-- mogging: initial schema, RLS policies, allowlist trigger, pairing RPCs
-- Run this once in the Supabase SQL Editor (see SETUP.md, Phase 2).

create extension if not exists pgcrypto;

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Someone',
  avatar_emoji text not null default '🙂',
  accent_color text,
  timezone text not null default 'UTC',
  points_total integer not null default 0,
  current_level integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, profile_id),
  unique (profile_id)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  title text not null,
  emoji text not null default '🎯',
  color text not null default '#22c55e',
  kind text not null check (kind in ('checkbox', 'counter')),
  target_per_day integer,
  unit text,
  difficulty text not null default 'easy' check (difficulty in ('trivial', 'easy', 'medium', 'hard')),
  category text,
  visibility text not null default 'private' check (visibility in ('shared', 'private')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint goals_counter_target_shape check (
    (kind = 'checkbox' and target_per_day is null)
    or (kind = 'counter' and target_per_day is not null and target_per_day > 0)
  )
);

create index goals_owner_idx on public.goals (owner_id);
create index goals_couple_idx on public.goals (couple_id);

create table public.goal_logs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  count integer not null default 0,
  completed boolean not null default false,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  unique (goal_id, log_date)
);

create index goal_logs_owner_date_idx on public.goal_logs (owner_id, log_date);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  title text not null,
  difficulty text not null default 'easy' check (difficulty in ('trivial', 'easy', 'medium', 'hard')),
  days_of_week integer[] not null default '{}',
  time_of_day text not null default 'any' check (time_of_day in ('morning', 'afternoon', 'evening', 'any')),
  is_active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now()
);

create index task_templates_owner_idx on public.task_templates (owner_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.task_templates (id) on delete set null,
  goal_id uuid references public.goals (id) on delete set null,
  title text not null,
  task_date date not null,
  difficulty text not null default 'easy' check (difficulty in ('trivial', 'easy', 'medium', 'hard')),
  time_of_day text not null default 'any' check (time_of_day in ('morning', 'afternoon', 'evening', 'any')),
  done boolean not null default false,
  done_at timestamptz,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  unique (owner_id, template_id, task_date)
);

create index tasks_owner_date_idx on public.tasks (owner_id, task_date);

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  emoji text,
  goal_id uuid references public.goals (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index nudges_to_read_idx on public.nudges (to_id, read_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

create table public.user_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  quiet_hours_start time,
  quiet_hours_end time,
  daily_reminder_time time,
  ai_enabled boolean not null default true
);

-- ============================================================================
-- HELPER FUNCTIONS (security definer so they can safely be used inside RLS
-- policies without re-triggering those same policies recursively)
-- ============================================================================

create or replace function public.same_couple(other_profile uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from couple_members me
    join couple_members them on them.couple_id = me.couple_id
    where me.profile_id = auth.uid()
      and them.profile_id = other_profile
  );
$$;

revoke execute on function public.same_couple(uuid) from public;
grant execute on function public.same_couple(uuid) to authenticated;

create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  -- unambiguous alphabet: no I, O, 0, 1
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.goals enable row level security;
alter table public.goal_logs enable row level security;
alter table public.task_templates enable row level security;
alter table public.tasks enable row level security;
alter table public.nudges enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.user_settings enable row level security;

-- profiles: read your own row, and your partner's row (for the Today/Partner/
-- Points screens); only ever write your own row. Row creation happens only
-- via the handle_new_user trigger below, never directly by clients.
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or same_couple(id));

create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- couples: read only if you're a member. All writes go through the
-- get_or_create_my_couple / join_couple functions below (security definer),
-- never directly, so there are no insert/update/delete policies here.
create policy couples_select on public.couples
  for select using (
    id in (select couple_id from couple_members where profile_id = auth.uid())
  );

-- couple_members: read your own membership row and your partner's. All
-- writes go through the pairing functions below.
create policy couple_members_select on public.couple_members
  for select using (profile_id = auth.uid() or same_couple(profile_id));

-- goals: owner can do everything with their own goals. Partner can read
-- (never write) goals explicitly marked shared, and only within the same
-- couple.
create policy goals_select on public.goals
  for select using (
    owner_id = auth.uid()
    or (visibility = 'shared' and same_couple(owner_id))
  );

create policy goals_insert on public.goals
  for insert with check (
    owner_id = auth.uid()
    and couple_id in (select couple_id from couple_members where profile_id = auth.uid())
  );

create policy goals_update on public.goals
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy goals_delete on public.goals
  for delete using (owner_id = auth.uid());

-- goal_logs: owner can read/write their own logs. Partner can read logs only
-- for goals marked shared. Writes (insert/update) are restricted to a
-- 7-day backfill window — this is enforced here via RLS (not a table CHECK)
-- specifically so that a future security-definer points-recalculation
-- function can still correct points_awarded on old rows without being
-- blocked by this same rule.
create policy goal_logs_select on public.goal_logs
  for select using (
    owner_id = auth.uid()
    or (
      same_couple(owner_id)
      and exists (
        select 1 from goals g
        where g.id = goal_logs.goal_id and g.visibility = 'shared'
      )
    )
  );

create policy goal_logs_insert on public.goal_logs
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
    and log_date <= current_date
    and log_date >= current_date - interval '7 days'
  );

create policy goal_logs_update on public.goal_logs
  for update using (owner_id = auth.uid()) with check (
    owner_id = auth.uid()
    and log_date <= current_date
    and log_date >= current_date - interval '7 days'
  );

-- task_templates: fully private planning data, owner-only.
create policy task_templates_all on public.task_templates
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- tasks: owner can read/write their own. Partner can read completions only
-- when the task is linked to a shared goal (powers the "Together" feed).
create policy tasks_select on public.tasks
  for select using (
    owner_id = auth.uid()
    or (
      goal_id is not null
      and same_couple(owner_id)
      and exists (
        select 1 from goals g where g.id = tasks.goal_id and g.visibility = 'shared'
      )
    )
  );

create policy tasks_insert on public.tasks
  for insert with check (owner_id = auth.uid());

create policy tasks_update on public.tasks
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy tasks_delete on public.tasks
  for delete using (owner_id = auth.uid());

-- nudges: sender and recipient can both read. Only the recipient can update
-- (to mark as read — enforced further by the immutability trigger below).
-- You may only nudge your own paired partner.
create policy nudges_select on public.nudges
  for select using (from_id = auth.uid() or to_id = auth.uid());

create policy nudges_insert on public.nudges
  for insert with check (from_id = auth.uid() and same_couple(to_id));

create policy nudges_update on public.nudges
  for update using (to_id = auth.uid()) with check (to_id = auth.uid());

-- push_subscriptions: strictly private, never shared with a partner.
create policy push_subscriptions_all on public.push_subscriptions
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- user_settings: strictly private, never shared with a partner.
create policy user_settings_all on public.user_settings
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Nudges are otherwise immutable once sent — a recipient can only ever flip
-- read_at, never the body/sender/target of a nudge.
create or replace function public.enforce_nudge_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.from_id <> old.from_id
     or new.to_id <> old.to_id
     or new.body <> old.body
     or coalesce(new.emoji, '') <> coalesce(old.emoji, '')
     or new.goal_id is distinct from old.goal_id
     or new.created_at <> old.created_at then
    raise exception 'Nudges are immutable except for read_at.';
  end if;
  return new;
end;
$$;

create trigger nudges_immutable_trigger
  before update on public.nudges
  for each row execute function public.enforce_nudge_immutability();

-- ============================================================================
-- SIGNUP ALLOWLIST + AUTO-PROVISIONING
--
-- The allowed emails live in a Postgres database setting (app.allowed_emails),
-- set once via:
--   ALTER DATABASE postgres SET app.allowed_emails = 'you@example.com,partner@example.com';
-- See SETUP.md for the exact command to run. This keeps the allowlist out of
-- git while still being "an env var checked in a Postgres trigger."
-- ============================================================================

create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[];
begin
  allowed := string_to_array(current_setting('app.allowed_emails', true), ',');

  if allowed is null or array_length(allowed, 1) is null then
    raise exception 'Signup is not configured: app.allowed_emails is not set. See SETUP.md.';
  end if;

  if not (
    lower(trim(new.email)) = any (select lower(trim(x)) from unnest(allowed) as x)
  ) then
    raise exception 'This app is invite-only.';
  end if;

  return new;
end;
$$;

create trigger enforce_allowlist_trigger
  before insert on auth.users
  for each row execute function public.enforce_allowlist();

-- Runs AFTER the auth.users row commits (profiles.id has a foreign key to
-- auth.users.id, so this can't run in the BEFORE trigger above).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (new.id, split_part(new.email, '@', 1), 'UTC')
  on conflict (id) do nothing;

  insert into public.user_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

create trigger handle_new_user_trigger
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- PAIRING RPCs
--
-- All writes to couples/couple_members go through these two functions rather
-- than direct table access, since there are deliberately no insert/update/
-- delete policies on those tables above.
-- ============================================================================

create or replace function public.get_or_create_my_couple()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing_couple_id uuid;
  new_code text;
  new_couple_id uuid;
  attempt int := 0;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id into existing_couple_id from couple_members where profile_id = me;

  if existing_couple_id is not null then
    return (
      select json_build_object(
        'couple_id', c.id,
        'invite_code', c.invite_code,
        'member_count', (select count(*) from couple_members where couple_id = c.id)
      )
      from couples c where c.id = existing_couple_id
    );
  end if;

  loop
    new_code := generate_invite_code();
    attempt := attempt + 1;
    begin
      insert into couples (invite_code) values (new_code) returning id into new_couple_id;
      exit;
    exception when unique_violation then
      if attempt > 10 then
        raise exception 'Could not generate a unique invite code, please try again.';
      end if;
    end;
  end loop;

  insert into couple_members (couple_id, profile_id) values (new_couple_id, me);

  return json_build_object(
    'couple_id', new_couple_id,
    'invite_code', new_code,
    'member_count', 1
  );
end;
$$;

revoke execute on function public.get_or_create_my_couple() from public;
grant execute on function public.get_or_create_my_couple() to authenticated;

create or replace function public.join_couple(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target_couple_id uuid;
  target_member_count int;
  my_current_couple_id uuid;
  my_current_member_count int;
  normalized_code text := upper(trim(p_code));
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select id into target_couple_id from couples where invite_code = normalized_code;
  if target_couple_id is null then
    raise exception 'invalid_code';
  end if;

  select couple_id into my_current_couple_id from couple_members where profile_id = me;

  if my_current_couple_id = target_couple_id then
    return json_build_object(
      'couple_id', target_couple_id,
      'invite_code', normalized_code,
      'member_count', (select count(*) from couple_members where couple_id = target_couple_id)
    );
  end if;

  select count(*) into target_member_count from couple_members where couple_id = target_couple_id;
  if target_member_count >= 2 then
    raise exception 'couple_full';
  end if;

  if my_current_couple_id is not null then
    select count(*) into my_current_member_count
    from couple_members where couple_id = my_current_couple_id;

    if my_current_member_count > 1 then
      raise exception 'already_paired';
    end if;

    -- leave and clean up my own unused solo couple before joining theirs
    delete from couple_members where couple_id = my_current_couple_id and profile_id = me;
    delete from couples where id = my_current_couple_id;
  end if;

  insert into couple_members (couple_id, profile_id) values (target_couple_id, me);

  return json_build_object(
    'couple_id', target_couple_id,
    'invite_code', normalized_code,
    'member_count', (select count(*) from couple_members where couple_id = target_couple_id)
  );
end;
$$;

revoke execute on function public.join_couple(text) from public;
grant execute on function public.join_couple(text) to authenticated;
