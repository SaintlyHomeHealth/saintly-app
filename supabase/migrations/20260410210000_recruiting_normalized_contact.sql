-- Recruiting CRM: normalized contact fields for duplicate detection (app-maintained + backfill).
-- Requires public.recruiting_candidates (20260410100000 or 20260410163000). IF EXISTS avoids hard errors if run alone.

alter table if exists public.recruiting_candidates
  add column if not exists normalized_email text;

alter table if exists public.recruiting_candidates
  add column if not exists normalized_phone text;

alter table if exists public.recruiting_candidates
  add column if not exists name_city_key text;

do $recruiting_norm$
begin
  if to_regclass('public.recruiting_candidates') is null then
    raise notice 'Skipping normalized indexes/backfill: recruiting_candidates not found. Apply 20260410100000 or 20260410163000 first.';
    return;
  end if;

  execute $ix1$
    create index if not exists recruiting_candidates_normalized_email_idx
      on public.recruiting_candidates (normalized_email)
      where normalized_email is not null
  $ix1$;

  execute $ix2$
    create index if not exists recruiting_candidates_normalized_phone_idx
      on public.recruiting_candidates (normalized_phone)
      where normalized_phone is not null
  $ix2$;

  execute $ix3$
    create index if not exists recruiting_candidates_name_city_key_idx
      on public.recruiting_candidates (name_city_key)
      where name_city_key is not null
  $ix3$;

  execute $cm1$
    comment on column public.recruiting_candidates.normalized_email is 'lower(trim(email)) for duplicate checks.';
  $cm1$;
  execute $cm2$
    comment on column public.recruiting_candidates.normalized_phone is 'Canonical digit string (10-digit NANP when applicable).';
  $cm2$;
  execute $cm3$
    comment on column public.recruiting_candidates.name_city_key is 'lower(trim(full_name))|lower(trim(city)) when both present; soft duplicate.';
  $cm3$;

  update public.recruiting_candidates
  set normalized_email = lower(trim(email))
  where email is not null and trim(email) <> '';

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

  update public.recruiting_candidates
  set name_city_key = lower(trim(full_name)) || '|' || lower(trim(city))
  where trim(coalesce(full_name, '')) <> ''
    and trim(coalesce(city, '')) <> '';
end;
$recruiting_norm$;
