-- CRM: distinguish employee hiring leads from patient-care pipeline (filtering / reporting).

alter table public.leads
  add column if not exists lead_type text;

comment on column public.leads.lead_type is 'When set to employee, lead originated from hiring (e.g. employment page). Null = patient-care / legacy leads.';

alter table public.leads
  drop constraint if exists leads_lead_type_check;

alter table public.leads
  add constraint leads_lead_type_check
  check (lead_type is null or lead_type = 'employee');

create index if not exists leads_lead_type_idx on public.leads (lead_type)
  where lead_type is not null;
