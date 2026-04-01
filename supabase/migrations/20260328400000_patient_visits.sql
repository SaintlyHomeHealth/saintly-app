-- Visit workflow rows per patient (scheduled → en_route → arrived → completed).

create table if not exists public.patient_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  assigned_user_id uuid references auth.users (id) on delete set null,
  scheduled_for timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'en_route', 'arrived', 'completed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_visits_patient_idx on public.patient_visits (patient_id, created_at desc);
create index if not exists patient_visits_status_idx on public.patient_visits (status)
  where status not in ('completed', 'canceled');

create or replace function public.touch_crm_patient_visits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patient_visits_updated_at on public.patient_visits;
create trigger patient_visits_updated_at
  before update on public.patient_visits
  for each row
  execute function public.touch_crm_patient_visits_updated_at();

alter table public.patient_visits enable row level security;

drop policy if exists "patient_visits_select_staff" on public.patient_visits;
create policy "patient_visits_select_staff"
  on public.patient_visits for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_visits_insert_staff" on public.patient_visits;
create policy "patient_visits_insert_staff"
  on public.patient_visits for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_visits_update_staff" on public.patient_visits;
create policy "patient_visits_update_staff"
  on public.patient_visits for update to authenticated
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

drop policy if exists "patient_visits_delete_staff" on public.patient_visits;
create policy "patient_visits_delete_staff"
  on public.patient_visits for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
