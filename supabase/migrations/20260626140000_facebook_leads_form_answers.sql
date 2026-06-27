-- Store normalized custom Q&A from Zapier / Meta webhooks on staging rows.

alter table public.facebook_leads
  add column if not exists lead_form_answers jsonb;

comment on column public.facebook_leads.lead_form_answers is
  'Custom question/answer pairs extracted from raw_payload (excludes standard contact fields).';
