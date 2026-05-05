-- CRM lead/patient insurance payer catalog (admin-managed, quick-add from lead detail).

create or replace function public.touch_insurance_payers_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.insurance_payers (
  id uuid primary key default gen_random_uuid(),
  payer_name text not null,
  normalized_name text generated always as (lower(trim(payer_name))) stored,
  payer_type text,
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  constraint insurance_payers_payer_name_nonempty check (char_length(trim(payer_name)) > 0)
);

create unique index insurance_payers_normalized_name_unique
  on public.insurance_payers (normalized_name);

create index insurance_payers_active_sort_name_idx
  on public.insurance_payers (is_active, sort_order, payer_name)
  where is_active = true;

drop trigger if exists insurance_payers_updated_at on public.insurance_payers;
create trigger insurance_payers_updated_at
  before update on public.insurance_payers
  for each row
  execute function public.touch_insurance_payers_updated_at();

comment on table public.insurance_payers is
  'Canonical insurance payer names for CRM intake comboboxes; normalized_name dedupes case/whitespace.';

alter table public.insurance_payers enable row level security;

-- App uses service role for reads/writes; no authenticated policies.

insert into public.insurance_payers (payer_name, sort_order)
values
  ('AARP / UnitedHealthcare', 10),
  ('Aetna', 20),
  ('Blue Cross Blue Shield', 30),
  ('Blue Cross Blue Shield of Arizona', 40),
  ('Cigna', 50),
  ('Globe Life', 60),
  ('Humana', 70),
  ('Mutual of Omaha', 80),
  ('Other', 90),
  ('State Farm', 100),
  ('UnitedHealthcare', 110)
on conflict (normalized_name) do nothing;
