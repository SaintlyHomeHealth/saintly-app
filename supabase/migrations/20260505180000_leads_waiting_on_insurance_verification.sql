-- Patient intake hold: insurance eligibility / benefits verification pending.

alter table public.leads
  add column if not exists waiting_on_insurance_verification boolean not null default false;

comment on column public.leads.waiting_on_insurance_verification is 'When true, insurance eligibility or benefits still need verification before scheduling or intake progression.';
