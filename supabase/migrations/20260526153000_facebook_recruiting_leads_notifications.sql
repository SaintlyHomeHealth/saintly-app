-- Facebook recruiting leads: applicant auto-SMS tracking + in-app admin notifications.

alter table public.facebook_recruiting_leads
  add column if not exists auto_sms_sent_at timestamptz,
  add column if not exists auto_sms_error text,
  add column if not exists last_admin_notification_sent_at timestamptz;

comment on column public.facebook_recruiting_leads.auto_sms_sent_at is
  'When the applicant thank-you SMS was sent (once per lead).';

comment on column public.facebook_recruiting_leads.auto_sms_error is
  'Last applicant SMS send failure message; lead creation is not rolled back.';

comment on column public.facebook_recruiting_leads.last_admin_notification_sent_at is
  'When staff in-app/push notification was sent for this lead (once per lead).';

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  type text not null,
  href text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_notifications_user_created_at_idx
  on public.admin_notifications (user_id, created_at desc);

create index if not exists admin_notifications_user_unread_idx
  on public.admin_notifications (user_id)
  where read_at is null;

create unique index if not exists admin_notifications_user_dedupe_uidx
  on public.admin_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

comment on table public.admin_notifications is
  'Per-staff in-app notification feed. FCM push can reference the same href; web UI can attach later.';

alter table public.admin_notifications enable row level security;

drop policy if exists "admin_notifications_select_own" on public.admin_notifications;
create policy "admin_notifications_select_own"
  on public.admin_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "admin_notifications_update_own" on public.admin_notifications;
create policy "admin_notifications_update_own"
  on public.admin_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admin_notifications_insert_staff" on public.admin_notifications;
create policy "admin_notifications_insert_staff"
  on public.admin_notifications for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
