-- Inbound fax structured extraction + triage. Does not touch fax_messages.note
-- (staff handwritten notes stay as-is). Reuses patient_name / patient_dob which
-- already exist for outbound clone prefill.

alter table public.fax_messages
  add column if not exists document_type text,
  add column if not exists service_date date,
  add column if not exists payer text,
  add column if not exists sender_org text,
  add column if not exists referring_provider text,
  add column if not exists clinician text,
  add column if not exists disciplines text[] not null default '{}',
  add column if not exists extraction_confidence jsonb,
  add column if not exists extraction_status text,
  add column if not exists extraction_source_page integer,
  add column if not exists triage_state text not null default 'new',
  add column if not exists patient_match_status text,
  add column if not exists last_extraction_at timestamptz,
  add column if not exists media_retry_count integer not null default 0,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists provider_error_code text;

comment on column public.fax_messages.document_type is 'Structured inbound extraction: referral, signed_485, progress_note, etc.';
comment on column public.fax_messages.extraction_status is 'pending | extracted | needs_review | media_missing | failed';
comment on column public.fax_messages.triage_state is 'Staff lifecycle: new | reviewed | assigned | filed | needs_review | failed';
comment on column public.fax_messages.extraction_confidence is 'JSON { patientName, documentType } 0-1 scores.';
comment on column public.fax_messages.patient_match_status is 'exact | near | none after fuzzy match to patients.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fax_messages_document_type_check'
  ) then
    alter table public.fax_messages
      add constraint fax_messages_document_type_check
      check (
        document_type is null
        or document_type in (
          'referral',
          'signed_485',
          'progress_note',
          'encounter_note',
          'dme_order',
          'auth_approval',
          'auth_denial',
          'records_request',
          'cover_sheet_only',
          'other'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fax_messages_extraction_status_check'
  ) then
    alter table public.fax_messages
      add constraint fax_messages_extraction_status_check
      check (
        extraction_status is null
        or extraction_status in ('pending', 'extracted', 'needs_review', 'media_missing', 'failed')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fax_messages_triage_state_check'
  ) then
    alter table public.fax_messages
      add constraint fax_messages_triage_state_check
      check (
        triage_state in ('new', 'reviewed', 'assigned', 'filed', 'needs_review', 'failed')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fax_messages_patient_match_status_check'
  ) then
    alter table public.fax_messages
      add constraint fax_messages_patient_match_status_check
      check (
        patient_match_status is null
        or patient_match_status in ('exact', 'near', 'none')
      );
  end if;
end
$$;

create index if not exists fax_messages_triage_idx
  on public.fax_messages (triage_state, received_at desc);

create index if not exists fax_messages_extraction_status_idx
  on public.fax_messages (extraction_status)
  where extraction_status is not null;

create index if not exists fax_messages_received_created_idx
  on public.fax_messages (received_at desc nulls last, created_at desc);

create index if not exists fax_messages_document_type_idx
  on public.fax_messages (document_type)
  where document_type is not null;
