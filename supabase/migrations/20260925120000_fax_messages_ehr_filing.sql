-- Fax Center EHR filing: Alora record name, filed marker, and a document flag for inbox filters.

alter table public.fax_messages
  add column if not exists display_title text,
  add column if not exists filed_to_ehr_at timestamptz,
  add column if not exists filed_by uuid references auth.users (id) on delete set null,
  add column if not exists ehr_patient_name text;

alter table public.fax_messages
  drop constraint if exists fax_messages_display_title_len;

alter table public.fax_messages
  add constraint fax_messages_display_title_len
  check (display_title is null or char_length(display_title) <= 50);

comment on column public.fax_messages.display_title is
  'Staff record name for Alora (max 50). Suggested format: LASTNAME, FIRSTNAME - Doc Type - MM-DD-YYYY. Separate from note.';
comment on column public.fax_messages.filed_to_ehr_at is
  'When staff marked this inbound fax as filed in Alora. Null means unfiled.';
comment on column public.fax_messages.filed_by is
  'Staff user who marked the fax filed in Alora.';
comment on column public.fax_messages.ehr_patient_name is
  'Patient name used when the fax was filed in Alora, usually the name portion of display_title.';

alter table public.fax_messages
  add column if not exists has_fax_document boolean
  generated always as (
    coalesce(btrim(storage_path), '') <> ''
    or coalesce(btrim(media_url), '') <> ''
  ) stored;

comment on column public.fax_messages.has_fax_document is
  'True when the fax has a stored PDF or a media URL. Inbox Unfiled requires this; empty transmissions stay on Failed / no document.';

create index if not exists fax_messages_inbound_filing_idx
  on public.fax_messages (is_archived, filed_to_ehr_at, received_at)
  where direction = 'inbound';
