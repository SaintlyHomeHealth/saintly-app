-- Dedupe inbound fax SMS/push alerts when Telnyx webhook retries (single dispatch per fax_message).

alter table public.fax_messages
  add column if not exists inbound_alert_sent_at timestamptz;

comment on column public.fax_messages.inbound_alert_sent_at is
  'When HIPAA-safe inbound fax SMS/push alerts were dispatched; NULL means not yet sent.';
