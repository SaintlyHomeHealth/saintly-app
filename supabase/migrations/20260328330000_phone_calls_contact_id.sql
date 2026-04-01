-- Link phone_calls to CRM contact when caller matches (application sets contact_id).

alter table public.phone_calls
  add column if not exists contact_id uuid references public.contacts (id) on delete set null;

create index if not exists phone_calls_contact_id_idx
  on public.phone_calls (contact_id)
  where contact_id is not null;
