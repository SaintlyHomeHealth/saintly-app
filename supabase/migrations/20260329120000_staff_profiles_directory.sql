-- Staff directory: optional auth link, display name, access flags for softphone / inbound ring.

alter table public.staff_profiles drop constraint if exists staff_profiles_user_id_key;

alter table public.staff_profiles
  alter column user_id drop not null;

create unique index if not exists staff_profiles_user_id_unique_when_set
  on public.staff_profiles (user_id)
  where user_id is not null;

alter table public.staff_profiles
  add column if not exists full_name text not null default '';

alter table public.staff_profiles
  add column if not exists is_active boolean not null default true;

alter table public.staff_profiles
  add column if not exists phone_access_enabled boolean not null default false;

alter table public.staff_profiles
  add column if not exists inbound_ring_enabled boolean not null default false;

update public.staff_profiles
set full_name = coalesce(
  nullif(trim(split_part(coalesce(email, ''), '@', 1)), ''),
  'Staff'
)
where nullif(trim(full_name), '') is null;

update public.staff_profiles
set phone_access_enabled = true
where user_id is not null;

comment on column public.staff_profiles.full_name is 'Display name for admin UI; not required to match auth metadata.';
comment on column public.staff_profiles.phone_access_enabled is 'When true, staff may obtain browser softphone tokens (subject to role rules in app).';
comment on column public.staff_profiles.inbound_ring_enabled is 'When true, user_id is included in inbound browser ring list (merged with env allowlist).';
