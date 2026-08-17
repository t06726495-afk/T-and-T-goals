-- mogging: make the invite-list check tolerant of stray whitespace.
-- Run after 20260804000000_partial_completion.sql.
--
-- The check trimmed the incoming email but not the stored one, so a row
-- pasted in with a trailing space silently never matched. The address looks
-- perfectly correct when you read the table, which makes this a genuinely
-- nasty half hour to debug.

-- Normalize what's already stored. Done before the function is replaced so
-- the table is clean either way.
update public.allowed_emails
set email = lower(trim(email))
where email <> lower(trim(email));

create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from allowed_emails where lower(trim(email)) = lower(trim(new.email))
  ) then
    raise exception 'This app is invite-only.';
  end if;

  return new;
end;
$$;

-- Answers "would this address get in?" using the trigger's exact condition,
-- rather than trusting a read of the table. allowed_emails is deliberately
-- unreachable from the app (RLS on, zero policies), so this is security
-- definer and only ever returns a boolean.
create or replace function public.is_email_allowed(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from allowed_emails where lower(trim(email)) = lower(trim(p_email))
  );
$$;

revoke execute on function public.is_email_allowed(text) from public;
