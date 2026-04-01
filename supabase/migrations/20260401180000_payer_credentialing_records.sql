-- Payer credentialing / contracting tracker (separate from CRM contacts directory).

create table if not exists public.payer_credentialing_records (
  id uuid primary key default gen_random_uuid(),
  payer_name text not null,
  payer_type text,
  market_state text,
  credentialing_status text not null default 'in_progress',
  contracting_status text not null default 'pending',
  portal_url text,
  portal_username_hint text,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  notes text,
  last_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payer_credentialing_records_cred_status_check
    check (
      credentialing_status in ('not_started', 'in_progress', 'submitted', 'enrolled', 'stalled')
    ),
  constraint payer_credentialing_records_contract_status_check
    check (contracting_status in ('pending', 'in_contracting', 'contracted', 'stalled'))
);

create index if not exists payer_credentialing_records_cred_status_idx
  on public.payer_credentialing_records (credentialing_status);
create index if not exists payer_credentialing_records_contract_status_idx
  on public.payer_credentialing_records (contracting_status);
create index if not exists payer_credentialing_records_updated_idx
  on public.payer_credentialing_records (updated_at desc);

comment on table public.payer_credentialing_records is
  'Payer onboarding / credentialing and contracting workflow; not a substitute for CRM contacts.';
comment on column public.payer_credentialing_records.portal_username_hint is
  'Optional non-secret reminder (e.g. org email); never store portal passwords here.';

create or replace function public.touch_payer_credentialing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payer_credentialing_records_updated_at on public.payer_credentialing_records;
create trigger payer_credentialing_records_updated_at
  before update on public.payer_credentialing_records
  for each row
  execute function public.touch_payer_credentialing_updated_at();

alter table public.payer_credentialing_records enable row level security;

drop policy if exists "payer_credentialing_select_staff" on public.payer_credentialing_records;
create policy "payer_credentialing_select_staff"
  on public.payer_credentialing_records for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_credentialing_insert_staff" on public.payer_credentialing_records;
create policy "payer_credentialing_insert_staff"
  on public.payer_credentialing_records for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_credentialing_update_staff" on public.payer_credentialing_records;
create policy "payer_credentialing_update_staff"
  on public.payer_credentialing_records for update to authenticated
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

drop policy if exists "payer_credentialing_delete_staff" on public.payer_credentialing_records;
create policy "payer_credentialing_delete_staff"
  on public.payer_credentialing_records for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
