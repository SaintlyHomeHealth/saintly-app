-- One normalized work email per staff row (case-insensitive via lower(trim)).
-- Drops legacy names if present, then creates a partial unique index so NULL/blank emails stay allowed.

drop index if exists public.staff_profiles_email_lower_uidx;
drop index if exists public.staff_profiles_work_email_lower_key;
drop index if exists public.staff_profiles_email_unique;

create unique index if not exists staff_profiles_work_email_lower_uidx
  on public.staff_profiles (lower(trim(email)))
  where email is not null and length(trim(email)) > 0;

comment on index public.staff_profiles_work_email_lower_uidx is
  'Prevents duplicate staff directory emails ignoring case/outer whitespace.';
