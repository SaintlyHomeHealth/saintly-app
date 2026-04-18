-- Facebook / Meta conversion tracking prep for CRM leads (`public.leads`).
-- Website leads are stored here; `public.conversations` is the SMS thread inbox.

alter table public.leads
  add column if not exists fbclid text,
  add column if not exists lead_quality text,
  add column if not exists lead_stage text not null default 'new';

alter table public.leads
  drop constraint if exists leads_lead_quality_check;

alter table public.leads
  add constraint leads_lead_quality_check
  check (lead_quality is null or lead_quality in ('qualified', 'unqualified'));

comment on column public.leads.fbclid is 'Facebook click id (fbclid) from landing URL when the lead was created.';
comment on column public.leads.lead_quality is 'Manual qualification for Meta conversion workflows: qualified | unqualified.';
comment on column public.leads.lead_stage is 'Optional funnel stage for automations; default new.';

create index if not exists leads_fbclid_idx
  on public.leads (fbclid)
  where fbclid is not null and trim(fbclid) <> '';
