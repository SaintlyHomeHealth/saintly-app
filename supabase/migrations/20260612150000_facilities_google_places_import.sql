-- Field-sales Phase 2: Google Places import metadata on facilities.

alter table public.facilities
  add column if not exists google_place_id text,
  add column if not exists source text,
  add column if not exists source_last_synced_at timestamptz,
  add column if not exists specialty_tags text[],
  add column if not exists imported_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists imported_at timestamptz;

create unique index if not exists facilities_google_place_id_uidx
  on public.facilities (google_place_id)
  where google_place_id is not null;

create index if not exists facilities_main_phone_idx
  on public.facilities (main_phone)
  where main_phone is not null;

create index if not exists facilities_source_idx
  on public.facilities (source)
  where source is not null;

comment on column public.facilities.google_place_id is 'Google Places API place id for deduplication';
comment on column public.facilities.source is 'Import source e.g. google_places, manual';
comment on column public.facilities.specialty_tags is 'Free-form specialty tags from discovery/import';
