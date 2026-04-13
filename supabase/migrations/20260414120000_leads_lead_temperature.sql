-- CRM visual triage: Hot / Warm / Cool / Dead (separate from pipeline `status`).

alter table public.leads
  add column if not exists lead_temperature text;

comment on column public.leads.lead_temperature is
  'Optional list triage: hot | warm | cool | dead. Independent of pipeline status and insurance.';

alter table public.leads
  drop constraint if exists leads_lead_temperature_check;

alter table public.leads
  add constraint leads_lead_temperature_check
  check (lead_temperature is null or lead_temperature in ('hot', 'warm', 'cool', 'dead'));

create index if not exists leads_lead_temperature_idx
  on public.leads (lead_temperature)
  where lead_temperature is not null;
