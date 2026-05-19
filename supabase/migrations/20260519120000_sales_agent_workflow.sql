-- Sales Agent workflow: role, lead credit/assignment fields, lead_documents, RLS, integrity trigger.

-- ---------------------------------------------------------------------------
-- 1. Staff role: sales_agent
-- ---------------------------------------------------------------------------

alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (
    role in (
      'super_admin',
      'admin',
      'manager',
      'nurse',
      'staff',
      'don',
      'recruiter',
      'billing',
      'dispatch',
      'credentialing',
      'read_only',
      'sales_agent'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Lead source: sales_agent
-- ---------------------------------------------------------------------------

alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (
    source in (
      'phone',
      'facebook',
      'facebook_ads',
      'facebook_lead_ads',
      'google',
      'hospital',
      'other',
      'manual',
      'walk_in',
      'referral',
      'email_referral',
      'email_inquiry',
      'sales_agent'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Sales credit vs operational assignment + intake fields
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists produced_by_sales_agent_id uuid null references auth.users (id) on delete set null;

alter table public.leads
  add column if not exists produced_by_source text null;

alter table public.leads
  add column if not exists ownership_locked boolean not null default false;

alter table public.leads
  add column if not exists assigned_to_staff_id uuid null references auth.users (id) on delete set null;

alter table public.leads
  add column if not exists converted_to_patient_at timestamptz null;

alter table public.leads
  add column if not exists converted_to_patient_by uuid null references auth.users (id) on delete set null;

alter table public.leads
  add column if not exists converted_patient_id uuid null references public.patients (id) on delete set null;

alter table public.leads
  add column if not exists caregiver_name text null;

alter table public.leads
  add column if not exists caregiver_phone_number text null;

alter table public.leads
  add column if not exists caregiver_relationship text null;

alter table public.leads
  add column if not exists insurance_name text null;

alter table public.leads
  add column if not exists insurance_type text null;

alter table public.leads
  add column if not exists insurance_member_id text null;

alter table public.leads
  add column if not exists consent_to_contact boolean not null default false;

alter table public.leads
  add column if not exists reason_for_referral text null;

create index if not exists leads_produced_by_sales_agent_id_idx
  on public.leads (produced_by_sales_agent_id)
  where produced_by_sales_agent_id is not null;

create index if not exists leads_assigned_to_staff_id_idx
  on public.leads (assigned_to_staff_id)
  where assigned_to_staff_id is not null;

create index if not exists leads_converted_patient_id_idx
  on public.leads (converted_patient_id)
  where converted_patient_id is not null;

comment on column public.leads.produced_by_sales_agent_id is
  'Locked sales credit owner (auth.users). Set when a sales agent submits a lead; not editable when ownership_locked.';
comment on column public.leads.assigned_to_staff_id is
  'Operational staff assignment for follow-up (distinct from sales credit).';
comment on column public.leads.ownership_locked is
  'When true, produced_by_sales_agent_id cannot be changed after insert.';

-- Prevent changing produced_by_sales_agent_id when ownership_locked = true.
create or replace function public.leads_guard_sales_agent_credit()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and coalesce(old.ownership_locked, false) = true then
    if new.produced_by_sales_agent_id is distinct from old.produced_by_sales_agent_id then
      raise exception 'produced_by_sales_agent_id is locked for this lead';
    end if;
    if new.ownership_locked is distinct from old.ownership_locked then
      raise exception 'ownership_locked cannot be changed for this lead';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_guard_sales_agent_credit on public.leads;
create trigger leads_guard_sales_agent_credit
  before update on public.leads
  for each row
  execute function public.leads_guard_sales_agent_credit();

-- ---------------------------------------------------------------------------
-- 4. lead_documents (Medicare / insurance card photos)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('lead-documents', 'lead-documents', false)
on conflict (id) do nothing;

create table if not exists public.lead_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  document_type text not null check (
    document_type in (
      'medicare_card_front',
      'medicare_card_back',
      'insurance_card_front',
      'insurance_card_back'
    )
  ),
  storage_bucket text not null default 'lead-documents',
  storage_path text not null,
  uploaded_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_documents_lead_id_idx on public.lead_documents (lead_id);
create index if not exists lead_documents_created_at_idx on public.lead_documents (created_at desc);

comment on table public.lead_documents is
  'PHI-eligible Medicare/insurance card images for CRM leads; private bucket lead-documents.';

alter table public.lead_documents enable row level security;

-- Helper: sales agent owns the lead
create or replace function public.lead_belongs_to_sales_agent(p_lead_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.produced_by_sales_agent_id = p_user_id
      and l.deleted_at is null
  );
$$;

-- Helper: CRM manager-tier staff
create or replace function public.staff_is_crm_leads_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.role in ('manager', 'admin', 'super_admin')
  );
$$;

-- Helper: sales agent role
create or replace function public.staff_is_sales_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid()
      and sp.role = 'sales_agent'
      and coalesce(sp.is_active, true) = true
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS: leads — sales agents see/create own; managers see all
-- ---------------------------------------------------------------------------

drop policy if exists "leads_select_sales_agent" on public.leads;
create policy "leads_select_sales_agent"
  on public.leads for select to authenticated
  using (
    public.staff_is_sales_agent()
    and produced_by_sales_agent_id = auth.uid()
  );

drop policy if exists "leads_insert_sales_agent" on public.leads;
create policy "leads_insert_sales_agent"
  on public.leads for insert to authenticated
  with check (
    public.staff_is_sales_agent()
    and produced_by_sales_agent_id = auth.uid()
    and ownership_locked = true
  );

drop policy if exists "leads_update_sales_agent" on public.leads;
-- Sales agents must not UPDATE leads via the Data API (create/read only; writes go through server actions).

-- contacts: sales agents cannot UPDATE contacts for other leads
drop policy if exists "contacts_select_sales_agent" on public.contacts;
create policy "contacts_select_sales_agent"
  on public.contacts for select to authenticated
  using (
    public.staff_is_sales_agent()
    and exists (
      select 1
      from public.leads l
      where l.contact_id = contacts.id
        and l.produced_by_sales_agent_id = auth.uid()
        and l.deleted_at is null
    )
  );

drop policy if exists "contacts_insert_sales_agent" on public.contacts;
create policy "contacts_insert_sales_agent"
  on public.contacts for insert to authenticated
  with check (public.staff_is_sales_agent());

-- ---------------------------------------------------------------------------
-- 6. RLS: lead_documents
-- ---------------------------------------------------------------------------

drop policy if exists "lead_documents_select" on public.lead_documents;
create policy "lead_documents_select"
  on public.lead_documents for select to authenticated
  using (
    public.staff_is_crm_leads_manager()
    or (
      public.staff_is_sales_agent()
      and public.lead_belongs_to_sales_agent(lead_id, auth.uid())
    )
  );

drop policy if exists "lead_documents_insert" on public.lead_documents;
create policy "lead_documents_insert"
  on public.lead_documents for insert to authenticated
  with check (
    public.staff_is_crm_leads_manager()
    or (
      public.staff_is_sales_agent()
      and public.lead_belongs_to_sales_agent(lead_id, auth.uid())
      and uploaded_by = auth.uid()
    )
  );

drop policy if exists "lead_documents_delete" on public.lead_documents;
create policy "lead_documents_delete"
  on public.lead_documents for delete to authenticated
  using (public.staff_is_crm_leads_manager());

-- ---------------------------------------------------------------------------
-- 7. Storage RLS: lead-documents bucket
-- ---------------------------------------------------------------------------

drop policy if exists "lead_documents_storage_select" on storage.objects;
drop policy if exists "lead_documents_storage_insert" on storage.objects;
drop policy if exists "lead_documents_storage_update" on storage.objects;
drop policy if exists "lead_documents_storage_delete" on storage.objects;

create policy "lead_documents_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-documents'
    and (
      public.staff_is_crm_leads_manager()
      or (
        public.staff_is_sales_agent()
        and public.lead_belongs_to_sales_agent(
          (storage.foldername(name))[1]::uuid,
          auth.uid()
        )
      )
    )
  );

create policy "lead_documents_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-documents'
    and (
      public.staff_is_crm_leads_manager()
      or public.staff_is_sales_agent()
    )
  );

create policy "lead_documents_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lead-documents'
    and (
      public.staff_is_crm_leads_manager()
      or (
        public.staff_is_sales_agent()
        and public.lead_belongs_to_sales_agent(
          (storage.foldername(name))[1]::uuid,
          auth.uid()
        )
      )
    )
  )
  with check (bucket_id = 'lead-documents');

create policy "lead_documents_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lead-documents'
    and public.staff_is_crm_leads_manager()
  );

-- Sales agents: read lead-insurance bucket for their own leads
drop policy if exists "lead_insurance_storage_select_sales_agent" on storage.objects;
create policy "lead_insurance_storage_select_sales_agent"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lead-insurance'
    and public.staff_is_sales_agent()
    and public.lead_belongs_to_sales_agent(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );

drop policy if exists "lead_insurance_storage_insert_sales_agent" on storage.objects;
create policy "lead_insurance_storage_insert_sales_agent"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-insurance'
    and public.staff_is_sales_agent()
  );
