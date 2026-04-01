-- CRM master directory: org-style names, internal owner, flexible payer/credentialing metadata.

alter table public.contacts
  add column if not exists organization_name text,
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null,
  add column if not exists relationship_metadata jsonb not null default '{}'::jsonb;

comment on column public.contacts.organization_name is
  'Legal or marketed name for facility, payer, or other org-style CRM records.';
comment on column public.contacts.owner_user_id is
  'Primary internal owner (auth.users id; matches staff_profiles.user_id).';
comment on column public.contacts.relationship_metadata is
  'Flexible CRM payload (e.g. payer plan id, NPI, contract stage). Deeper credentialing onboarding can live in dedicated tables keyed by contact_id.';

create index if not exists contacts_owner_user_id_idx on public.contacts (owner_user_id)
  where owner_user_id is not null;

create index if not exists contacts_contact_type_idx on public.contacts (contact_type)
  where contact_type is not null and trim(contact_type) <> '';
