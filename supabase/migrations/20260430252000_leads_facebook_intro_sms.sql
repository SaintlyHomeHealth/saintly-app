-- Auto-intro SMS tracking for Facebook Lead Ads ingestion (see `facebook-lead-intro-sms.ts`).

alter table public.leads
  add column if not exists initial_sms_status text,
  add column if not exists initial_sms_sent_at timestamptz,
  add column if not exists initial_sms_error text;

alter table public.leads
  drop constraint if exists leads_initial_sms_status_check;

alter table public.leads
  add constraint leads_initial_sms_status_check
  check (
    initial_sms_status is null
    or initial_sms_status in ('pending', 'sent', 'failed', 'skipped')
  );

comment on column public.leads.initial_sms_status is
  'First automated intro SMS for eligible Facebook leads: pending | sent | failed | skipped.';
comment on column public.leads.initial_sms_sent_at is 'When the intro SMS was accepted by Twilio (outbound send succeeded).';
comment on column public.leads.initial_sms_error is 'Twilio/API error text, or skip reason (e.g. invalid phone).';
