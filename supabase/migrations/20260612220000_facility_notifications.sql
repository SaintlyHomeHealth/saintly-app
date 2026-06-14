-- Facility outreach in-app notifications (field sales + intake + manager alerts).

create table if not exists public.facility_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  facility_id uuid null references public.facilities (id) on delete set null,
  lead_id uuid null references public.leads (id) on delete set null,
  task_id uuid null references public.facility_follow_up_tasks (id) on delete set null,
  activity_id uuid null references public.facility_activities (id) on delete set null,
  notification_type text not null,
  title text not null,
  message text null,
  severity text not null default 'info',
  status text not null default 'unread',
  action_url text null,
  metadata jsonb null default '{}'::jsonb,
  dedupe_key text null,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  dismissed_at timestamptz null,
  constraint facility_notifications_severity_check
    check (severity in ('info', 'success', 'warning', 'urgent')),
  constraint facility_notifications_status_check
    check (status in ('unread', 'read', 'dismissed'))
);

create index if not exists facility_notifications_user_id_idx
  on public.facility_notifications (user_id);

create index if not exists facility_notifications_status_idx
  on public.facility_notifications (status);

create index if not exists facility_notifications_type_idx
  on public.facility_notifications (notification_type);

create index if not exists facility_notifications_facility_id_idx
  on public.facility_notifications (facility_id);

create index if not exists facility_notifications_lead_id_idx
  on public.facility_notifications (lead_id);

create index if not exists facility_notifications_task_id_idx
  on public.facility_notifications (task_id);

create index if not exists facility_notifications_created_at_idx
  on public.facility_notifications (created_at desc);

create index if not exists facility_notifications_user_unread_idx
  on public.facility_notifications (user_id, created_at desc)
  where status = 'unread';

create unique index if not exists facility_notifications_user_dedupe_unread_uidx
  on public.facility_notifications (user_id, dedupe_key)
  where dedupe_key is not null and status = 'unread';

comment on table public.facility_notifications is
  'In-app facility outreach alerts for follow-ups, referrals, warm sources, and manager oversight.';

alter table public.facility_notifications enable row level security;

drop policy if exists "facility_notifications_select_own" on public.facility_notifications;
create policy "facility_notifications_select_own"
  on public.facility_notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "facility_notifications_update_own" on public.facility_notifications;
create policy "facility_notifications_update_own"
  on public.facility_notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
