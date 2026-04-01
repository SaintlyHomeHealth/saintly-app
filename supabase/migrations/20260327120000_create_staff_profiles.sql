-- Staff permission model: one row per auth user allowed in the admin app.
-- Roles are enforced in application code later; RLS only exposes each user their own row.

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  role text not null check (role in ('super_admin', 'admin', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_user_id_key unique (user_id)
);

create index if not exists staff_profiles_user_id_idx on public.staff_profiles (user_id);

create index if not exists staff_profiles_role_idx on public.staff_profiles (role);

alter table public.staff_profiles enable row level security;

create policy "Staff profiles are readable by owner"
  on public.staff_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));
