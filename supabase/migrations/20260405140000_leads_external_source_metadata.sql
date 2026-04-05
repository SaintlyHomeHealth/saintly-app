-- External lead sources (e.g. Meta Lead Ads): idempotency + audit payload on CRM leads.

alter table public.leads
  add column if not exists external_source_id text,
  add column if not exists external_source_metadata jsonb;

comment on column public.leads.external_source_id is 'Stable id from external system (e.g. Meta leadgen_id) for deduplication.';
comment on column public.leads.external_source_metadata is 'JSON: webhook payload, Graph API response, ingestion timestamps for audit.';

create unique index if not exists leads_source_external_source_id_uidx
  on public.leads (source, external_source_id)
  where external_source_id is not null;
