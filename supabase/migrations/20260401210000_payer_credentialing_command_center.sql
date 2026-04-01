-- Command center: owner assignment, document checklist, append-only activity log.
-- Child table for documents: one row per (payer, doc_type) — extensible via new doc_type values, no JSON blobs.

-- ---------------------------------------------------------------------------
-- Payer record: assigned owner (auth user id, same pattern as CRM owner_user_id)
-- ---------------------------------------------------------------------------
alter table public.payer_credentialing_records
  add column if not exists assigned_owner_user_id uuid references auth.users (id) on delete set null;

create index if not exists payer_credentialing_records_assigned_owner_idx
  on public.payer_credentialing_records (assigned_owner_user_id)
  where assigned_owner_user_id is not null;

comment on column public.payer_credentialing_records.assigned_owner_user_id is
  'Responsible staff (auth.users id; matches staff_profiles.user_id).';

-- ---------------------------------------------------------------------------
-- Documents: minimal checklist (status + optional uploaded_at). No file storage here.
-- ---------------------------------------------------------------------------
create table if not exists public.payer_credentialing_documents (
  id uuid primary key default gen_random_uuid(),
  credentialing_record_id uuid not null references public.payer_credentialing_records (id) on delete cascade,
  doc_type text not null,
  status text not null default 'missing',
  uploaded_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payer_cred_docs_status_check
    check (status in ('missing', 'uploaded', 'not_applicable')),
  constraint payer_cred_docs_record_type_unique unique (credentialing_record_id, doc_type)
);

create index if not exists payer_cred_docs_record_idx
  on public.payer_credentialing_documents (credentialing_record_id);

comment on table public.payer_credentialing_documents is
  'Enrollment/contracting document checklist per payer record; track received vs missing without storing files.';

create or replace function public.touch_payer_cred_doc_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payer_cred_docs_updated_at on public.payer_credentialing_documents;
create trigger payer_cred_docs_updated_at
  before update on public.payer_credentialing_documents
  for each row
  execute function public.touch_payer_cred_doc_updated_at();

-- Seed default document rows for new payer records
create or replace function public.payer_credentialing_seed_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.payer_credentialing_documents (credentialing_record_id, doc_type, status)
  values
    (new.id, 'w9', 'missing'),
    (new.id, 'npi_letter', 'missing'),
    (new.id, 'liability_insurance', 'missing'),
    (new.id, 'accreditation', 'missing'),
    (new.id, 'eft_era', 'missing'),
    (new.id, 'portal_enrollment', 'missing')
  on conflict (credentialing_record_id, doc_type) do nothing;
  return new;
end;
$$;

drop trigger if exists payer_credentialing_records_seed_docs on public.payer_credentialing_records;
create trigger payer_credentialing_records_seed_docs
  after insert on public.payer_credentialing_records
  for each row
  execute function public.payer_credentialing_seed_documents();

-- Backfill documents for existing payer rows
insert into public.payer_credentialing_documents (credentialing_record_id, doc_type, status)
select
  p.id,
  v.doc_type,
  'missing'
from public.payer_credentialing_records p
cross join (
  values
    ('w9'),
    ('npi_letter'),
    ('liability_insurance'),
    ('accreditation'),
    ('eft_era'),
    ('portal_enrollment')
) as v (doc_type)
on conflict (credentialing_record_id, doc_type) do nothing;

alter table public.payer_credentialing_documents enable row level security;

drop policy if exists "payer_cred_docs_select_staff" on public.payer_credentialing_documents;
create policy "payer_cred_docs_select_staff"
  on public.payer_credentialing_documents for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_docs_insert_staff" on public.payer_credentialing_documents;
create policy "payer_cred_docs_insert_staff"
  on public.payer_credentialing_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_docs_update_staff" on public.payer_credentialing_documents;
create policy "payer_cred_docs_update_staff"
  on public.payer_credentialing_documents for update to authenticated
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

-- ---------------------------------------------------------------------------
-- Activity: append-only audit / timeline (no update/delete policies)
-- ---------------------------------------------------------------------------
create table if not exists public.payer_credentialing_activity (
  id uuid primary key default gen_random_uuid(),
  credentialing_record_id uuid not null references public.payer_credentialing_records (id) on delete cascade,
  activity_type text not null,
  summary text not null,
  details text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users (id) on delete set null
);

create index if not exists payer_cred_activity_record_created_idx
  on public.payer_credentialing_activity (credentialing_record_id, created_at desc);

comment on table public.payer_credentialing_activity is
  'Append-only timeline for payer credentialing (status, follow-up, notes, documents).';

alter table public.payer_credentialing_activity enable row level security;

drop policy if exists "payer_cred_activity_select_staff" on public.payer_credentialing_activity;
create policy "payer_cred_activity_select_staff"
  on public.payer_credentialing_activity for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_activity_insert_staff" on public.payer_credentialing_activity;
create policy "payer_cred_activity_insert_staff"
  on public.payer_credentialing_activity for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
