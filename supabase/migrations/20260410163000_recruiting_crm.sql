-- Nurse/clinician recruiting CRM (Indeed pipeline): candidates + activity timeline.

create table if not exists public.recruiting_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  phone text,
  email text,
  city text,
  state text,
  zip text,
  coverage_area text,
  discipline text,
  source text not null default 'Indeed',
  status text not null default 'New',
  assigned_to uuid references auth.users (id) on delete set null,
  indeed_url text,
  resume_url text,
  notes text,
  last_call_at timestamptz,
  last_text_at timestamptz,
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiting_candidates_status_idx on public.recruiting_candidates (status);
create index if not exists recruiting_candidates_discipline_idx on public.recruiting_candidates (discipline);
create index if not exists recruiting_candidates_coverage_area_idx on public.recruiting_candidates (coverage_area);
create index if not exists recruiting_candidates_source_idx on public.recruiting_candidates (source);
create index if not exists recruiting_candidates_next_follow_up_at_idx on public.recruiting_candidates (next_follow_up_at);
create index if not exists recruiting_candidates_last_contact_at_idx on public.recruiting_candidates (last_contact_at desc);
create index if not exists recruiting_candidates_assigned_to_idx on public.recruiting_candidates (assigned_to);

create table if not exists public.recruiting_candidate_activities (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.recruiting_candidates (id) on delete cascade,
  activity_type text not null,
  outcome text,
  body text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists recruiting_candidate_activities_candidate_id_idx
  on public.recruiting_candidate_activities (candidate_id);
create index if not exists recruiting_candidate_activities_created_at_idx
  on public.recruiting_candidate_activities (created_at desc);
create index if not exists recruiting_candidate_activities_outcome_idx
  on public.recruiting_candidate_activities (outcome);

-- updated_at on candidates only (activities are append-only).
create or replace function public.touch_recruiting_candidates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recruiting_candidates_updated_at on public.recruiting_candidates;
create trigger recruiting_candidates_updated_at
  before update on public.recruiting_candidates
  for each row
  execute function public.touch_recruiting_candidates_updated_at();

-- RLS: same staff pattern as facilities CRM (manager / admin / super_admin).

alter table public.recruiting_candidates enable row level security;
alter table public.recruiting_candidate_activities enable row level security;

drop policy if exists "recruiting_candidates_select_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_select_staff"
  on public.recruiting_candidates for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidates_insert_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_insert_staff"
  on public.recruiting_candidates for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidates_update_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_update_staff"
  on public.recruiting_candidates for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidates_delete_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_delete_staff"
  on public.recruiting_candidates for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidate_activities_select_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_select_staff"
  on public.recruiting_candidate_activities for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidate_activities_insert_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_insert_staff"
  on public.recruiting_candidate_activities for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidate_activities_update_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_update_staff"
  on public.recruiting_candidate_activities for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "recruiting_candidate_activities_delete_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_delete_staff"
  on public.recruiting_candidate_activities for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
