-- Link recruiting candidates to shared CRM `contacts` for phone/SMS caller ID resolution.

alter table if exists public.recruiting_candidates
  add column if not exists crm_contact_id uuid references public.contacts (id) on delete set null;

create index if not exists recruiting_candidates_crm_contact_id_idx
  on public.recruiting_candidates (crm_contact_id)
  where crm_contact_id is not null;

comment on column public.recruiting_candidates.crm_contact_id is
  'CRM contact used for shared phone/SMS identity (inbound match, directory); deduped by phone then email.';
