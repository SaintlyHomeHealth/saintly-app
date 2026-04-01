-- Expand operational visit statuses (confirmed, missed, rescheduled) while keeping existing rows valid.

alter table public.patient_visits drop constraint if exists patient_visits_status_check;

alter table public.patient_visits
  add constraint patient_visits_status_check
  check (
    status in (
      'scheduled',
      'confirmed',
      'en_route',
      'arrived',
      'completed',
      'missed',
      'rescheduled',
      'canceled'
    )
  );
