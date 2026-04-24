-- Patient references in group messages (company/team) — does not grant private thread access.
alter table public.internal_chat_messages
  add column if not exists mention_patient_ids uuid[] not null default '{}';

comment on column public.internal_chat_messages.mention_patient_ids is
  'Patient ids referenced in this message (group chat cards); RLS on patient data still applies elsewhere.';
