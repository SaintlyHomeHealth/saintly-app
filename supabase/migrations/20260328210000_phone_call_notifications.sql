-- Durable follow-up alerts for missed calls and voicemails (Twilio-first).
-- Writes: service role (webhooks). Reads/updates: admin / super_admin.

create table if not exists public.phone_call_notifications (
  id uuid primary key default gen_random_uuid(),
  phone_call_id uuid not null references public.phone_calls (id) on delete cascade,
  type text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  constraint phone_call_notifications_type_check check (type in ('missed_call', 'voicemail')),
  constraint phone_call_notifications_status_check check (
    status in ('new', 'acknowledged', 'resolved')
  )
);

create unique index if not exists phone_call_notifications_call_type_uidx
  on public.phone_call_notifications (phone_call_id, type);

create index if not exists phone_call_notifications_status_created_idx
  on public.phone_call_notifications (status, created_at desc);

alter table public.phone_call_notifications enable row level security;

drop policy if exists "phone_call_notifications_select_admin" on public.phone_call_notifications;
create policy "phone_call_notifications_select_admin"
  on public.phone_call_notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "phone_call_notifications_update_admin" on public.phone_call_notifications;
create policy "phone_call_notifications_update_admin"
  on public.phone_call_notifications
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );
