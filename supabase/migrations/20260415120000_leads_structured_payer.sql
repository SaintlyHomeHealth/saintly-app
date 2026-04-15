-- Structured primary/secondary payer fields on CRM leads (Medicare + supplement vs MA, etc.).
-- Legacy `payer_name` / `payer_type` remain; app syncs them on save for backward compatibility.

alter table public.leads
  add column if not exists primary_payer_type text,
  add column if not exists primary_payer_name text,
  add column if not exists secondary_payer_type text,
  add column if not exists secondary_payer_name text;

comment on column public.leads.primary_payer_type is 'Structured payer category: original_medicare, medicare_advantage, medicaid, commercial, supplement, other.';
comment on column public.leads.primary_payer_name is 'Primary payer display name (plan/member label).';
comment on column public.leads.secondary_payer_type is 'Secondary payer category (e.g. supplement, medicaid crossover).';
comment on column public.leads.secondary_payer_name is 'Secondary payer display name.';

-- Safe backfill: copy legacy payer name into primary when new column is empty.
update public.leads
set primary_payer_name = payer_name
where (primary_payer_name is null or trim(primary_payer_name) = '')
  and payer_name is not null
  and trim(payer_name) <> '';
