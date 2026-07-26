-- mogging: nudge delivery scheduling, server-side rate limiting, and quiet
-- hours. Run after 20260729000000_benchmarks.sql.

-- ============================================================================
-- DELIVERY COLUMNS
--
-- A nudge is stored immediately (so it shows in the feed) but its PUSH may
-- be held until the recipient's quiet hours end — queued, never dropped.
-- ============================================================================

alter table public.nudges
  add column if not exists deliver_after timestamptz not null default now(),
  add column if not exists delivered_at timestamptz;

create index if not exists nudges_pending_delivery_idx
  on public.nudges (deliver_after)
  where delivered_at is null;

-- Tracks the last daily reminder sent per person so the cron (which runs
-- every 15 minutes to catch every timezone) doesn't send twice in one day.
alter table public.user_settings
  add column if not exists last_reminder_on date;

-- ============================================================================
-- QUIET HOURS
--
-- Returns when a push to this person may next be delivered: now() if
-- they're not in quiet hours, otherwise the next time quiet hours end,
-- computed in THEIR timezone (handles windows that wrap midnight, which is
-- the normal case for sleep).
-- ============================================================================

create or replace function public.next_deliverable_at(p_profile_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  qs time;
  qe time;
  local_now timestamp;
  local_time time;
  in_quiet boolean;
  target_date date;
begin
  select p.timezone, s.quiet_hours_start, s.quiet_hours_end
    into tz, qs, qe
  from profiles p
  left join user_settings s on s.profile_id = p.id
  where p.id = p_profile_id;

  if tz is null or qs is null or qe is null or qs = qe then
    return now();
  end if;

  local_now := now() at time zone tz;
  local_time := local_now::time;

  if qs < qe then
    in_quiet := local_time >= qs and local_time < qe;
  else
    -- Window wraps midnight (e.g. 22:00 to 07:00).
    in_quiet := local_time >= qs or local_time < qe;
  end if;

  if not in_quiet then
    return now();
  end if;

  if qs < qe then
    target_date := local_now::date;
  elsif local_time >= qs then
    target_date := (local_now + interval '1 day')::date;
  else
    target_date := local_now::date;
  end if;

  return (target_date + qe) at time zone tz;
end;
$$;

revoke execute on function public.next_deliverable_at(uuid) from public;
grant execute on function public.next_deliverable_at(uuid) to authenticated;

-- ============================================================================
-- RATE LIMIT + SCHEDULING
--
-- Enforced in a trigger rather than in the API layer so the cap holds no
-- matter which path writes the row (client, serverless function, SQL
-- editor). Counted against the SENDER's local day.
-- ============================================================================

create or replace function public.nudges_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_tz text;
  sent_today integer;
begin
  select timezone into sender_tz from profiles where id = new.from_id;
  sender_tz := coalesce(sender_tz, 'UTC');

  select count(*) into sent_today
  from nudges
  where from_id = new.from_id
    and (created_at at time zone sender_tz)::date = (now() at time zone sender_tz)::date;

  if sent_today >= 10 then
    raise exception 'nudge_rate_limit';
  end if;

  new.deliver_after := public.next_deliverable_at(new.to_id);
  return new;
end;
$$;

drop trigger if exists nudges_before_insert_trigger on public.nudges;
create trigger nudges_before_insert_trigger
  before insert on public.nudges
  for each row execute function public.nudges_before_insert();

-- The Phase 2 immutability trigger predates these columns; allow the
-- delivery bookkeeping fields to change while everything else stays frozen.
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
    raise exception 'Nudges are immutable except for read/delivery state.';
  end if;
  return new;
end;
$$;

-- ============================================================================
-- HOW MANY NUDGES ARE LEFT TODAY
-- ============================================================================

create or replace function public.nudges_remaining_today()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_tz text;
  sent_today integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(timezone, 'UTC') into sender_tz from profiles where id = auth.uid();

  select count(*) into sent_today
  from nudges
  where from_id = auth.uid()
    and (created_at at time zone sender_tz)::date = (now() at time zone sender_tz)::date;

  return greatest(0, 10 - sent_today);
end;
$$;

revoke execute on function public.nudges_remaining_today() from public;
grant execute on function public.nudges_remaining_today() to authenticated;

-- ============================================================================
-- TOGETHER FEED
--
-- Chronological recent activity across both partners: completions on
-- SHARED goals, benchmark achievements on SHARED benchmarks, and nudges
-- between the two of you. SECURITY DEFINER so it can assemble the feed in
-- one pass, but it only ever includes rows the caller could already read
-- (own rows, or the partner's explicitly-shared ones).
-- ============================================================================

create or replace function public.together_feed(p_limit integer default 40)
returns table(
  kind text,
  actor_id uuid,
  target_id uuid,
  title text,
  emoji text,
  color text,
  body text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_couple uuid;
  span integer := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id into my_couple from couple_members where profile_id = me;
  if my_couple is null then
    return;
  end if;

  return query
  with members as (
    select profile_id from couple_members where couple_id = my_couple
  )
  select * from (
    -- Goal completions (mine, or the partner's shared ones)
    select 'completion'::text,
           gl.owner_id,
           null::uuid,
           g.title,
           g.emoji,
           g.color,
           null::text,
           (gl.log_date + time '12:00')::timestamptz
    from goal_logs gl
    join goals g on g.id = gl.goal_id
    where gl.completed
      and gl.owner_id in (select profile_id from members)
      and (gl.owner_id = me or g.visibility = 'shared')

    union all

    -- Benchmarks hit
    select 'benchmark'::text,
           b.owner_id,
           null::uuid,
           b.title,
           b.emoji,
           b.color,
           null::text,
           b.achieved_at
    from benchmarks b
    where b.achieved_at is not null
      and b.owner_id in (select profile_id from members)
      and (b.owner_id = me or b.visibility = 'shared')

    union all

    -- Nudges either direction
    select 'nudge'::text,
           n.from_id,
           n.to_id,
           null::text,
           n.emoji,
           null::text,
           n.body,
           n.created_at
    from nudges n
    where n.from_id = me or n.to_id = me
  ) feed(kind, actor_id, target_id, title, emoji, color, body, occurred_at)
  order by occurred_at desc
  limit span;
end;
$$;

revoke execute on function public.together_feed(integer) from public;
grant execute on function public.together_feed(integer) to authenticated;
