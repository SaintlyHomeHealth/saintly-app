-- Lightweight visit presence tracking for nurse action taps (no background tracking).

alter table public.patient_visits
  add column if not exists en_route_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.patient_visits
  add column if not exists arrived_lat double precision,
  add column if not exists arrived_lng double precision,
  add column if not exists arrived_accuracy_meters double precision,
  add column if not exists completed_lat double precision,
  add column if not exists completed_lng double precision,
  add column if not exists completed_accuracy_meters double precision;

alter table public.patient_visits drop constraint if exists patient_visits_arrived_lat_check;
alter table public.patient_visits add constraint patient_visits_arrived_lat_check
  check (arrived_lat is null or (arrived_lat >= -90 and arrived_lat <= 90));

alter table public.patient_visits drop constraint if exists patient_visits_arrived_lng_check;
alter table public.patient_visits add constraint patient_visits_arrived_lng_check
  check (arrived_lng is null or (arrived_lng >= -180 and arrived_lng <= 180));

alter table public.patient_visits drop constraint if exists patient_visits_completed_lat_check;
alter table public.patient_visits add constraint patient_visits_completed_lat_check
  check (completed_lat is null or (completed_lat >= -90 and completed_lat <= 90));

alter table public.patient_visits drop constraint if exists patient_visits_completed_lng_check;
alter table public.patient_visits add constraint patient_visits_completed_lng_check
  check (completed_lng is null or (completed_lng >= -180 and completed_lng <= 180));
