-- Home health CRM foundation: contacts (master people), leads, patients, assignments.
-- Phone fields should store E.164 where possible for consistent matching from Twilio.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  full_name text,
  primary_phone text,
  secondary_phone text,
  email text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  zip text,
  contact_type text,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_primary_phone_idx on public.contacts (primary_phone)
  where primary_phone is not null and trim(primary_phone) <> '';

create index if not exists contacts_secondary_phone_idx on public.contacts (secondary_phone)
  where secondary_phone is not null and trim(secondary_phone) <> '';

create index if not exists contacts_created_at_idx on public.contacts (created_at desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  source text not null check (source in ('phone', 'facebook', 'google', 'hospital', 'other')),
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_contact_id_idx on public.leads (contact_id);
create index if not exists leads_created_at_idx on public.leads (created_at desc);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  patient_status text not null default 'pending'
    check (patient_status in ('active', 'inactive', 'discharged', 'pending')),
  start_of_care date,
  payer_name text,
  physician_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_contact_id_key unique (contact_id)
);

create index if not exists patients_created_at_idx on public.patients (created_at desc);

create table if not exists public.patient_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  assigned_user_id uuid references auth.users (id) on delete set null,
  role text not null check (role in ('primary_nurse', 'backup_nurse', 'intake', 'admin')),
  is_active boolean not null default true,
  assigned_at timestamptz not null default now()
);

create index if not exists patient_assignments_patient_idx on public.patient_assignments (patient_id);
create index if not exists patient_assignments_user_idx on public.patient_assignments (assigned_user_id)
  where assigned_user_id is not null;
create index if not exists patient_assignments_active_idx on public.patient_assignments (patient_id, is_active)
  where is_active = true;

create or replace function public.touch_crm_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at
  before update on public.contacts
  for each row
  execute function public.touch_crm_contacts_updated_at();

create or replace function public.touch_crm_leads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at
  before update on public.leads
  for each row
  execute function public.touch_crm_leads_updated_at();

create or replace function public.touch_crm_patients_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists patients_updated_at on public.patients;
create trigger patients_updated_at
  before update on public.patients
  for each row
  execute function public.touch_crm_patients_updated_at();

alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.patients enable row level security;
alter table public.patient_assignments enable row level security;

-- Staff (manager / admin / super_admin): full CRUD on CRM tables (app-enforced writes).

drop policy if exists "contacts_select_staff" on public.contacts;
create policy "contacts_select_staff"
  on public.contacts for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "contacts_insert_staff" on public.contacts;
create policy "contacts_insert_staff"
  on public.contacts for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "contacts_update_staff" on public.contacts;
create policy "contacts_update_staff"
  on public.contacts for update to authenticated
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

drop policy if exists "contacts_delete_staff" on public.contacts;
create policy "contacts_delete_staff"
  on public.contacts for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "leads_select_staff" on public.leads;
create policy "leads_select_staff"
  on public.leads for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "leads_insert_staff" on public.leads;
create policy "leads_insert_staff"
  on public.leads for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "leads_update_staff" on public.leads;
create policy "leads_update_staff"
  on public.leads for update to authenticated
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

drop policy if exists "leads_delete_staff" on public.leads;
create policy "leads_delete_staff"
  on public.leads for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patients_select_staff" on public.patients;
create policy "patients_select_staff"
  on public.patients for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patients_insert_staff" on public.patients;
create policy "patients_insert_staff"
  on public.patients for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patients_update_staff" on public.patients;
create policy "patients_update_staff"
  on public.patients for update to authenticated
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

drop policy if exists "patients_delete_staff" on public.patients;
create policy "patients_delete_staff"
  on public.patients for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_assignments_select_staff" on public.patient_assignments;
create policy "patient_assignments_select_staff"
  on public.patient_assignments for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_assignments_insert_staff" on public.patient_assignments;
create policy "patient_assignments_insert_staff"
  on public.patient_assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "patient_assignments_update_staff" on public.patient_assignments;
create policy "patient_assignments_update_staff"
  on public.patient_assignments for update to authenticated
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

drop policy if exists "patient_assignments_delete_staff" on public.patient_assignments;
create policy "patient_assignments_delete_staff"
  on public.patient_assignments for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
