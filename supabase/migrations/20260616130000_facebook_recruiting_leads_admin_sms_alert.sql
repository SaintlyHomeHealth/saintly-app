-- Track one-time admin SMS alert for new website/Facebook recruiting leads.

alter table public.facebook_recruiting_leads
  add column if not exists last_admin_sms_alert_sent_at timestamptz,
  add column if not exists last_admin_sms_alert_error text;

comment on column public.facebook_recruiting_leads.last_admin_sms_alert_sent_at is
  'When the RECRUITING_ADMIN_ALERT_PHONE SMS was sent for this lead (once per lead).';

comment on column public.facebook_recruiting_leads.last_admin_sms_alert_error is
  'Last admin SMS alert failure; lead creation is not rolled back.';
