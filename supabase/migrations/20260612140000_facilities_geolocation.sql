-- Field-sales: geolocation columns for distance-based facility finder.

alter table public.facilities
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists facilities_latitude_longitude_idx
  on public.facilities (latitude, longitude)
  where latitude is not null and longitude is not null;

comment on column public.facilities.latitude is 'WGS84 latitude for field-sales distance sorting';
comment on column public.facilities.longitude is 'WGS84 longitude for field-sales distance sorting';
