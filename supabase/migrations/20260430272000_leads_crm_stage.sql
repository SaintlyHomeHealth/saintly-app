-- CRM pipeline stage (lead → intake → patient), distinct from `lead_stage` (Meta funnel) and `status` (pipeline).

alter table public.leads
  add column if not exists crm_stage text;

update public.leads
set crm_stage = case
  when lower(trim(coalesce(status, ''))) = 'converted' then 'patient'
  else 'lead'
end
where crm_stage is null;

alter table public.leads
  alter column crm_stage set default 'lead';

alter table public.leads
  alter column crm_stage set not null;

alter table public.leads
  drop constraint if exists leads_crm_stage_check;

alter table public.leads
  add constraint leads_crm_stage_check
  check (crm_stage = any (array['lead'::text, 'intake'::text, 'patient'::text]));

comment on column public.leads.crm_stage is 'CRM record stage: lead, intake, patient (reversible; clinical workflows use patient).';
