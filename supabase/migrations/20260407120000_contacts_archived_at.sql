-- Soft-archive CRM contacts: hide from default directory lists without breaking FKs (calls, SMS, leads, patients).

alter table public.contacts
  add column if not exists archived_at timestamptz;

comment on column public.contacts.archived_at is 'When set, contact is hidden from default CRM directory queries; related history rows remain.';

create index if not exists contacts_created_at_active_idx on public.contacts (created_at desc)
  where archived_at is null;
