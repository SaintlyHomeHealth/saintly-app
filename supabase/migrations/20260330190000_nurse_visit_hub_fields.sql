-- Nurse workspace: visit plan summary on patient, visit notes + reminder tracking on patient_visits.

alter table public.patients
  add column if not exists visit_plan_summary text,
  add column if not exists visit_plan_target_total int;

alter table public.patient_visits
  add column if not exists visit_note text;

alter table public.patient_visits
  add column if not exists reminder_recipient text default 'patient';

alter table public.patient_visits drop constraint if exists patient_visits_reminder_recipient_check;
alter table public.patient_visits
  add constraint patient_visits_reminder_recipient_check
  check (reminder_recipient in ('patient', 'caregiver', 'both'));

alter table public.patient_visits
  add column if not exists reminder_day_before_sent_at timestamptz,
  add column if not exists reminder_day_of_sent_at timestamptz;

update public.patient_visits set reminder_recipient = coalesce(reminder_recipient, 'patient');

comment on column public.patients.visit_plan_summary is 'POC-style free-text visit frequency summary (ops; not clinical orders).';
comment on column public.patients.visit_plan_target_total is 'Optional planned total visits for the episode; used with completed count for remaining.';
comment on column public.patient_visits.visit_note is 'Nurse/admin note for this scheduled visit.';
comment on column public.patient_visits.reminder_recipient is 'Who should receive automated SMS reminders for this visit.';
comment on column public.patient_visits.reminder_day_before_sent_at is 'Set when day-before reminder SMS was sent (idempotent).';
comment on column public.patient_visits.reminder_day_of_sent_at is 'Set when day-of reminder SMS was sent (idempotent).';
