-- Territory cadence + relationship strength for Facilities CRM.

alter table public.facilities
  add column if not exists visit_frequency text,
  add column if not exists relationship_strength smallint;

alter table public.facilities
  drop constraint if exists facilities_visit_frequency_check;

alter table public.facilities
  add constraint facilities_visit_frequency_check
  check (visit_frequency is null or visit_frequency in ('weekly', 'biweekly', 'monthly'));

alter table public.facilities
  drop constraint if exists facilities_relationship_strength_check;

alter table public.facilities
  add constraint facilities_relationship_strength_check
  check (relationship_strength is null or (relationship_strength >= 1 and relationship_strength <= 5));

create index if not exists facilities_visit_frequency_idx on public.facilities (visit_frequency)
  where visit_frequency is not null;
