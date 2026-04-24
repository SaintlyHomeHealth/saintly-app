-- Align stored emails with the same rules as the app: strip zero-width / BOM, trim, lower().
-- Unique index uses this function so hidden Unicode/whitespace cannot bypass Staff Email Tools.

create or replace function public.normalize_staff_work_email(input text)
returns text
language plpgsql
immutable
parallel safe
as $$
declare
  s text;
begin
  if input is null then
    return null;
  end if;
  s := replace(replace(replace(replace(input, chr(8203), ''), chr(8204), ''), chr(8205), ''), chr(65279), '');
  s := lower(trim(s));
  if s = '' then
    return null;
  end if;
  return s;
end;
$$;

comment on function public.normalize_staff_work_email(text) is
  'Canonical work email for staff_profiles: ZWSP/ZWJ/ZWNJ/BOM removed, trimmed, lowercased; blank -> NULL.';

-- Backfill: only set to canonical string when normalization is non-null (preserves intent).
update public.staff_profiles
set email = public.normalize_staff_work_email(email)
where email is not null
  and public.normalize_staff_work_email(email) is not null;

-- Placeholders only: unclean/blank email -> NULL (never strip email on rows with login).
update public.staff_profiles
set email = null
where user_id is null
  and email is not null
  and public.normalize_staff_work_email(email) is null;

do $$
begin
  if exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id is not null
      and sp.email is not null
      and public.normalize_staff_work_email(sp.email) is null
  ) then
    raise exception
      'staff_profiles: at least one row with user_id has an email that normalizes to empty (whitespace/zero-width only). Fix those emails in SQL before re-running this migration.';
  end if;
end $$;

do $$
declare
  dup_detail text;
begin
  select string_agg(format('%s (%s rows)', n, c), '; ' order by n)
    into dup_detail
  from (
    select public.normalize_staff_work_email(email) as n, count(*)::int as c
    from public.staff_profiles
    where email is not null
    group by 1
    having count(*) > 1
  ) d;

  if dup_detail is not null then
    raise exception
      'staff_profiles has duplicate normalized work emails after cleanup. Resolve manually (keep active/login row; archive or clear email on others). Detail: %',
      dup_detail;
  end if;
end $$;

drop index if exists public.staff_profiles_work_email_lower_uidx;
drop index if exists public.staff_profiles_work_email_normalized_uidx;

create unique index staff_profiles_work_email_normalized_uidx
  on public.staff_profiles (public.normalize_staff_work_email(email))
  where public.normalize_staff_work_email(email) is not null;

comment on index public.staff_profiles_work_email_normalized_uidx is
  'One row per canonical work email (normalize_staff_work_email).';

-- Exact same predicate as SQL diagnostic: lower(trim + ZW strip) in one function.
create or replace function public.admin_staff_profiles_conflicts_for_email(p_email text)
returns table (
  id uuid,
  email text,
  is_active boolean,
  user_id uuid,
  full_name text,
  role text,
  normalized_email text,
  char_len integer,
  octet_len integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.id,
    sp.email,
    sp.is_active,
    sp.user_id,
    sp.full_name,
    sp.role::text,
    public.normalize_staff_work_email(sp.email) as normalized_email,
    char_length(sp.email) as char_len,
    octet_length(convert_to(sp.email, 'UTF8')) as octet_len
  from public.staff_profiles sp
  where public.normalize_staff_work_email(sp.email) is not null
    and public.normalize_staff_work_email(sp.email)
      = public.normalize_staff_work_email(p_email);
$$;

comment on function public.admin_staff_profiles_conflicts_for_email(text) is
  'Admin/service-role: all staff_profiles rows matching the same canonical email as p_email (raw).';

revoke all on function public.admin_staff_profiles_conflicts_for_email(text) from public;
grant execute on function public.admin_staff_profiles_conflicts_for_email(text) to service_role;
