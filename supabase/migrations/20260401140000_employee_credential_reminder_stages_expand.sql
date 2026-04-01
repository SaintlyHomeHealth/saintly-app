-- Split "due soon" into 30-day vs 7-day reminder stages for dedupe (manual + daily cron).

alter table public.employee_credential_reminder_sends
  drop constraint if exists employee_credential_reminder_sends_stage_check;

update public.employee_credential_reminder_sends
set reminder_stage = 'due_soon_30'
where reminder_stage = 'due_soon';

alter table public.employee_credential_reminder_sends
  add constraint employee_credential_reminder_sends_stage_check
  check (reminder_stage in ('due_soon_30', 'due_soon_7', 'expired', 'missing'));

comment on constraint employee_credential_reminder_sends_stage_check on public.employee_credential_reminder_sends is
  'due_soon_30: 8–30d remaining; due_soon_7: 0–7d; expired: past expiration; missing: no credential on file.';
