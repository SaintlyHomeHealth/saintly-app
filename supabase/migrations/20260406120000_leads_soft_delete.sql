-- Soft-delete CRM leads: hide from normal lists without breaking contact/call/message history.

alter table public.leads
  add column if not exists deleted_at timestamptz;

comment on column public.leads.deleted_at is 'When set, lead is archived (soft-deleted) and excluded from default CRM lists.';

create index if not exists leads_deleted_at_idx on public.leads (deleted_at)
  where deleted_at is not null;

-- Facebook external id: allow same leadgen_id again only after the prior row is soft-deleted.
drop index if exists leads_source_external_source_id_uidx;

create unique index if not exists leads_source_external_source_id_uidx
  on public.leads (source, external_source_id)
  where external_source_id is not null and deleted_at is null;
