-- SMS credential reminders from admin employee directory (dedupe + audit).

create table if not exists public.employee_credential_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  applicant_id uuid not null references public.applicants (id) on delete cascade,
  credential_type text not null,
  reminder_stage text not null,
  expiration_anchor text not null,
  staff_user_id uuid,
  twilio_message_sid text,
  body_preview text,
  metadata jsonb not null default '{}'::jsonb,
  constraint employee_credential_reminder_sends_stage_check
    check (reminder_stage in ('due_soon', 'expired', 'missing')),
  constraint employee_credential_reminder_sends_dedupe unique (applicant_id, credential_type, expiration_anchor, reminder_stage)
);

create index if not exists employee_credential_reminder_sends_applicant_idx
  on public.employee_credential_reminder_sends (applicant_id, created_at desc);

comment on table public.employee_credential_reminder_sends is
  'Outbound credential SMS reminders; unique on applicant+credential+expiration_anchor+stage prevents duplicate spam.';

alter table public.employee_credential_reminder_sends enable row level security;

drop policy if exists "employee_credential_reminder_sends_select_staff" on public.employee_credential_reminder_sends;
create policy "employee_credential_reminder_sends_select_staff"
  on public.employee_credential_reminder_sends
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

-- Inserts use service role from server actions (bypass RLS). No insert policy for authenticated.
