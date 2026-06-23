-- Denormalized outbound fax context for "Send another doc" clone prefill.

alter table public.fax_messages
  add column if not exists patient_name text,
  add column if not exists patient_dob text,
  add column if not exists patient_medicare_number text,
  add column if not exists recipient_phone text,
  add column if not exists recipient_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists template_type text,
  add column if not exists fax_metadata jsonb;

comment on column public.fax_messages.patient_name is 'Patient display name captured at send time for fax packet clone prefill.';
comment on column public.fax_messages.patient_dob is 'Patient DOB (MM/DD/YYYY or ISO) captured at send time.';
comment on column public.fax_messages.patient_medicare_number is 'Medicare/member number captured at send time.';
comment on column public.fax_messages.recipient_phone is 'Recipient office phone captured at send time.';
comment on column public.fax_messages.recipient_contact_id is 'CRM contact for the fax recipient (provider/office).';
comment on column public.fax_messages.template_type is 'Outbound template context: fax_packet, simple, facility_packet, etc.';
comment on column public.fax_messages.fax_metadata is 'Extensible outbound fax context for clone prefill and auditing.';

create index if not exists fax_messages_patient_id_outbound_idx
  on public.fax_messages (patient_id, created_at desc)
  where patient_id is not null and direction = 'outbound';

create index if not exists fax_messages_recipient_contact_idx
  on public.fax_messages (recipient_contact_id)
  where recipient_contact_id is not null;
