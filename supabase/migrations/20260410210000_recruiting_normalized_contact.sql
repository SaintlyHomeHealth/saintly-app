-- Recruiting CRM: normalized contact fields for duplicate detection (app-maintained + backfill).

alter table public.recruiting_candidates
  add column if not exists normalized_email text;

alter table public.recruiting_candidates
  add column if not exists normalized_phone text;

alter table public.recruiting_candidates
  add column if not exists name_city_key text;

create index if not exists recruiting_candidates_normalized_email_idx
  on public.recruiting_candidates (normalized_email)
  where normalized_email is not null;

create index if not exists recruiting_candidates_normalized_phone_idx
  on public.recruiting_candidates (normalized_phone)
  where normalized_phone is not null;

create index if not exists recruiting_candidates_name_city_key_idx
  on public.recruiting_candidates (name_city_key)
  where name_city_key is not null;

comment on column public.recruiting_candidates.normalized_email is 'lower(trim(email)) for duplicate checks.';
comment on column public.recruiting_candidates.normalized_phone is 'Canonical digit string (10-digit NANP when applicable).';
comment on column public.recruiting_candidates.name_city_key is 'lower(trim(full_name))|lower(trim(city)) when both present; soft duplicate.';

-- Backfill email
update public.recruiting_candidates
set normalized_email = lower(trim(email))
where email is not null and trim(email) <> '';

-- Backfill phone digits then NANP trim (align with app: 11 starting with 1 -> last 10)
update public.recruiting_candidates
set normalized_phone = regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
where phone is not null and trim(phone) <> '';

update public.recruiting_candidates
set normalized_phone = case
  when normalized_phone is null then null
  when length(normalized_phone) = 11 and normalized_phone like '1%' then substring(normalized_phone from 2 for 10)
  else normalized_phone
end
where normalized_phone is not null;

update public.recruiting_candidates
set normalized_phone = null
where normalized_phone is not null and length(normalized_phone) < 7;

-- Backfill name+city key
update public.recruiting_candidates
set name_city_key = lower(trim(full_name)) || '|' || lower(trim(city))
where trim(coalesce(full_name, '')) <> ''
  and trim(coalesce(city, '')) <> '';
