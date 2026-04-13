-- CRM lead thread: structured activity rows + typed Medicare fields on leads.

alter table public.leads
  add column if not exists medicare_number text,
  add column if not exists medicare_effective_date date,
  add column if not exists medicare_notes text;

comment on column public.leads.medicare_number is 'Medicare Beneficiary Identifier (MBI) or legacy HICN — CRM staff only; not a substitute for verified eligibility.';
comment on column public.leads.medicare_effective_date is 'Optional Part A/B effective date when captured at lead intake.';
comment on column public.leads.medicare_notes is 'Optional staff notes about Medicare coverage or verification.';

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  event_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz,
  deletable boolean not null default false
);

comment on table public.lead_activities is 'CRM lead timeline: manual notes, contact attempts, and auto-logged field changes.';
comment on column public.lead_activities.event_type is 'e.g. manual_note, contact_attempt, status_changed, document_uploaded.';
comment on column public.lead_activities.deletable is 'True only for manual_note entries that staff may soft-delete.';

create index if not exists lead_activities_lead_created_idx
  on public.lead_activities (lead_id, created_at asc);

create index if not exists lead_activities_lead_active_idx
  on public.lead_activities (lead_id)
  where deleted_at is null;

alter table public.lead_activities enable row level security;

drop policy if exists "lead_activities_select_staff" on public.lead_activities;
create policy "lead_activities_select_staff"
  on public.lead_activities for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_activities_insert_staff" on public.lead_activities;
create policy "lead_activities_insert_staff"
  on public.lead_activities for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "lead_activities_update_staff" on public.lead_activities;
create policy "lead_activities_update_staff"
  on public.lead_activities for update to authenticated
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
