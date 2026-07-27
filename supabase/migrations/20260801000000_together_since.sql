-- mogging: the date the couple started, for the "days together" counter on
-- Today. Lives on couples rather than a profile so both people see the same
-- number without having to enter it twice.
-- Run after 20260731000000_task_notes.sql.

alter table public.couples
  add column if not exists together_since date;

-- couples has no update policy (Phase 2 routes all writes through
-- security-definer functions), so setting the date goes through one too.
create or replace function public.set_together_since(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_couple uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select couple_id into my_couple from couple_members where profile_id = me;
  if my_couple is null then
    raise exception 'Not in a couple';
  end if;

  update couples set together_since = p_date where id = my_couple;
end;
$$;

revoke execute on function public.set_together_since(date) from public;
grant execute on function public.set_together_since(date) to authenticated;
