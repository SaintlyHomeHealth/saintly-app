-- Mobile push device tokens (FCM) for workspace staff — SMS alerts and inbound-call alerts.
-- Writes: authenticated users (register own row). Reads: server-side service role for fan-out sends.

create table if not exists public.user_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  fcm_token text not null,
  device_install_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_devices_platform_check check (platform in ('ios', 'android')),
  constraint user_push_devices_user_fcm_unique unique (user_id, fcm_token)
);

create index if not exists user_push_devices_user_id_idx
  on public.user_push_devices (user_id);

create index if not exists user_push_devices_fcm_token_idx
  on public.user_push_devices (fcm_token);

drop trigger if exists user_push_devices_updated_at on public.user_push_devices;
create trigger user_push_devices_updated_at
  before update on public.user_push_devices
  for each row
  execute function public.touch_conversations_updated_at();

alter table public.user_push_devices enable row level security;

drop policy if exists "user_push_devices_select_own" on public.user_push_devices;
create policy "user_push_devices_select_own"
  on public.user_push_devices
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_push_devices_insert_own" on public.user_push_devices;
create policy "user_push_devices_insert_own"
  on public.user_push_devices
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_push_devices_update_own" on public.user_push_devices;
create policy "user_push_devices_update_own"
  on public.user_push_devices
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "user_push_devices_delete_own" on public.user_push_devices;
create policy "user_push_devices_delete_own"
  on public.user_push_devices
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
