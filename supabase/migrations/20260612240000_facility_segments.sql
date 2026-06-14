-- Saved facility filter segments for campaign enrollment (Phase 18).

create table if not exists public.facility_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  filters_json jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facility_segments_created_by_idx
  on public.facility_segments (created_by);

alter table public.facility_segments enable row level security;

drop policy if exists "facility_segments_select_staff" on public.facility_segments;
create policy "facility_segments_select_staff"
  on public.facility_segments for select to authenticated using (true);

comment on table public.facility_segments is
  'Reusable facility filter presets for campaign enrollment.';

create or replace function public.touch_facility_segments_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_segments_updated_at on public.facility_segments;
create trigger facility_segments_updated_at
  before update on public.facility_segments
  for each row execute function public.touch_facility_segments_updated_at();
