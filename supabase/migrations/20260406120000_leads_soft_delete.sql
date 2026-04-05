-- Soft-delete CRM leads only. Safe when run alone (no dependency on external_source_id).

alter table public.leads
  add column if not exists deleted_at timestamptz;

comment on column public.leads.deleted_at is 'When set, lead is archived (soft-deleted) and excluded from default CRM lists.';

create index if not exists leads_deleted_at_idx on public.leads (deleted_at)
  where deleted_at is not null;
