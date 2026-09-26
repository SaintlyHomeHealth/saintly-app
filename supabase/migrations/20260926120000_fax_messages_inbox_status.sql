-- Inbox filing status for inbound faxes.
-- Transmission outcome stays on fax_messages.status (received, delivered, failed).
-- inbox_status is the staff disposition that drives Fax Center inbox tabs.

alter table public.fax_messages
  add column if not exists inbox_status text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references auth.users (id) on delete set null,
  add column if not exists status_note text;

-- Existing rows: filed in Alora -> filed. Everything else -> unfiled.
-- Keep filed_to_ehr_at. Record who filed when we already have that user.
update public.fax_messages
set
  inbox_status = case when filed_to_ehr_at is not null then 'filed' else 'unfiled' end,
  status_changed_at = case
    when filed_to_ehr_at is not null then coalesce(status_changed_at, filed_to_ehr_at)
    else status_changed_at
  end,
  status_changed_by = case
    when filed_to_ehr_at is not null then coalesce(status_changed_by, filed_by)
    else status_changed_by
  end
where inbox_status is null
   or inbox_status not in (
     'unfiled',
     'filed',
     'needs_admission',
     'wrong_recipient',
     'junk',
     'unreadable'
   );

alter table public.fax_messages
  alter column inbox_status set default 'unfiled';

update public.fax_messages
set inbox_status = 'unfiled'
where inbox_status is null;

alter table public.fax_messages
  alter column inbox_status set not null;

alter table public.fax_messages
  drop constraint if exists fax_messages_inbox_status_check;

alter table public.fax_messages
  add constraint fax_messages_inbox_status_check
  check (
    inbox_status in (
      'unfiled',
      'filed',
      'needs_admission',
      'wrong_recipient',
      'junk',
      'unreadable'
    )
  );

alter table public.fax_messages
  drop constraint if exists fax_messages_status_note_len;

alter table public.fax_messages
  add constraint fax_messages_status_note_len
  check (status_note is null or char_length(status_note) <= 500);

comment on column public.fax_messages.inbox_status is
  'Staff inbox disposition: unfiled (default), filed, needs_admission, wrong_recipient, junk, unreadable. Separate from transmission status.';
comment on column public.fax_messages.status_changed_at is
  'When inbox_status last changed. Backfilled from filed_to_ehr_at for faxes already filed.';
comment on column public.fax_messages.status_changed_by is
  'Staff user who last changed inbox_status. Backfilled from filed_by when that user is known.';
comment on column public.fax_messages.status_note is
  'Optional staff note for the inbox disposition (max 500). Separate from the fax note and the Alora record name.';

-- Tab filters are inbound + not archived + one inbox_status, ordered by received_at.
create index if not exists fax_messages_inbound_inbox_status_idx
  on public.fax_messages (inbox_status, received_at)
  where direction = 'inbound' and is_archived = false;

-- Default Unfiled tab also requires a document. Failed transmissions stay on their own filter.
create index if not exists fax_messages_inbound_unfiled_queue_idx
  on public.fax_messages (received_at)
  where direction = 'inbound'
    and is_archived = false
    and inbox_status = 'unfiled'
    and has_fax_document = true;
