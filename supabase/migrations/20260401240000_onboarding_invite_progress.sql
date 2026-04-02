-- Lightweight onboarding invite + progress tracking (applicant pre-hire flow).
-- Extends existing public.onboarding_status (applicant_id PK, current_step, application_completed, ...).

alter table public.onboarding_status
  add column if not exists onboarding_invite_status text,
  add column if not exists onboarding_invite_sent_at timestamptz,
  add column if not exists onboarding_invite_last_channel text,
  add column if not exists onboarding_flow_status text,
  add column if not exists onboarding_progress_percent integer,
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_last_activity_at timestamptz;

comment on column public.onboarding_status.onboarding_invite_status is
  'Admin invite lifecycle: NULL = legacy/not tracked, not_sent, sent.';
comment on column public.onboarding_status.onboarding_invite_last_channel is
  'Last invite delivery: sms, email, or both.';
comment on column public.onboarding_status.onboarding_flow_status is
  'Applicant-facing coarse state: not_started, started, in_progress, completed.';

create table if not exists public.onboarding_invite_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  staff_user_id uuid,
  channels text not null,
  twilio_message_sid text,
  email_sent boolean not null default false,
  onboarding_link text,
  metadata jsonb not null default '{}'::jsonb,
  constraint onboarding_invite_sends_channels_check
    check (channels in ('sms', 'email', 'both'))
);

create index if not exists onboarding_invite_sends_applicant_idx
  on public.onboarding_invite_sends (applicant_id, created_at desc);

comment on table public.onboarding_invite_sends is
  'Audit log for each onboarding invite send (SMS and/or email); resends append new rows.';

alter table public.onboarding_invite_sends enable row level security;

drop policy if exists "onboarding_invite_sends_select_staff" on public.onboarding_invite_sends;
create policy "onboarding_invite_sends_select_staff"
  on public.onboarding_invite_sends
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('super_admin', 'admin', 'manager')
    )
  );
