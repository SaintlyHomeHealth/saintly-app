-- Ensure outreach columns exist when older migrations were not applied to production.

alter table public.facilities
  add column if not exists visit_frequency text;

comment on column public.facilities.visit_frequency is
  'Optional outreach cadence/frequency label for facility relationship management.';

alter table public.facilities
  add column if not exists relationship_strength smallint;

alter table public.facilities
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
