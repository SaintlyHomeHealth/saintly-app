-- Denied credentialing stage + optional structured denial reason for reporting.

alter table public.payer_credentialing_records
  drop constraint if exists payer_credentialing_records_cred_status_check;

alter table public.payer_credentialing_records
  add constraint payer_credentialing_records_cred_status_check
  check (
    credentialing_status in (
      'not_started',
      'in_progress',
      'submitted',
      'enrolled',
      'stalled',
      'denied'
    )
  );

alter table public.payer_credentialing_records
  add column if not exists denial_reason text;

comment on column public.payer_credentialing_records.denial_reason is
  'Optional payer/staff explanation when credentialing_status is denied (reporting + follow-up).';
