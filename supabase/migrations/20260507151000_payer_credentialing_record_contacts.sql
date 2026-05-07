-- Credentialing payer contacts (multi-contact; replaces payer_credentialing_record_emails usage in-app).
-- Migrates rows from payer_credentialing_record_emails and optionally enriches from legacy parent columns.

-- ---------------------------------------------------------------------------
create table if not exists public.payer_credentialing_record_contacts (
  id uuid primary key default gen_random_uuid(),
  credentialing_record_id uuid not null
    references public.payer_credentialing_records (id) on delete cascade,
  name text,
  role text,
  email text,
  phone text,
  extension text,
  label text,
  notes text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payer_cred_record_contact_has_identifier check (
    length(trim(coalesce(name, ''))) > 0
    or length(trim(coalesce(email, ''))) > 0
    or length(trim(coalesce(phone, ''))) > 0
  ),
  constraint payer_cred_record_contact_email_trim check (
    email is null or trim(email) = email
  ),
  constraint payer_cred_record_contact_phone_trim check (
    phone is null or trim(phone) = phone
  )
);

comment on table public.payer_credentialing_record_contacts is
  'Multiple contacts per payer credentialing carrier; replaces record-level email duplicates in app layer. Legacy payer_credentialing_record_emails retained for rollback.';

create index if not exists payer_cred_record_contacts_record_sort_idx
  on public.payer_credentialing_record_contacts (credentialing_record_id, sort_order asc, created_at asc);

create unique index if not exists payer_cred_record_contacts_one_primary_per_record
  on public.payer_credentialing_record_contacts (credentialing_record_id)
  where is_primary = true;

drop trigger if exists payer_cred_record_contacts_updated_at on public.payer_credentialing_record_contacts;
create trigger payer_cred_record_contacts_updated_at
  before update on public.payer_credentialing_record_contacts
  for each row execute function public.touch_payer_credentialing_updated_at();

alter table public.payer_credentialing_record_contacts enable row level security;

drop policy if exists "payer_cred_record_contacts_select_staff" on public.payer_credentialing_record_contacts;
create policy "payer_cred_record_contacts_select_staff"
  on public.payer_credentialing_record_contacts for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_record_contacts_insert_staff" on public.payer_credentialing_record_contacts;
create policy "payer_cred_record_contacts_insert_staff"
  on public.payer_credentialing_record_contacts for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_record_contacts_update_staff" on public.payer_credentialing_record_contacts;
create policy "payer_cred_record_contacts_update_staff"
  on public.payer_credentialing_record_contacts for update to authenticated
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

drop policy if exists "payer_cred_record_contacts_delete_staff" on public.payer_credentialing_record_contacts;
create policy "payer_cred_record_contacts_delete_staff"
  on public.payer_credentialing_record_contacts for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Data: migrate from payer_credentialing_record_emails (if table exists).
-- ---------------------------------------------------------------------------
insert into public.payer_credentialing_record_contacts (
  credentialing_record_id,
  email,
  label,
  notes,
  is_primary,
  is_active,
  sort_order,
  created_at
)
select
  e.credentialing_record_id,
  trim(e.email),
  e.label,
  null::text as notes,
  e.is_primary,
  true,
  coalesce(e.sort_order, 0),
  coalesce(e.created_at, now())
from public.payer_credentialing_record_emails as e;

-- Rows with no migrated contacts yet: fold legacy parent primary fields into one contact.
insert into public.payer_credentialing_record_contacts (
  credentialing_record_id,
  name,
  role,
  email,
  phone,
  is_primary,
  is_active,
  sort_order
)
select
  p.id,
  nullif(trim(p.primary_contact_name), ''),
  nullif(trim(p.primary_contact_title), ''),
  nullif(trim(p.primary_contact_email), ''),
  nullif(trim(p.primary_contact_phone), ''),
  true,
  case
    when trim(coalesce(p.primary_contact_status, 'active')) = 'inactive' then false
    else true
  end,
  0
from public.payer_credentialing_records as p
where not exists (
  select 1
  from public.payer_credentialing_record_contacts c
  where c.credentialing_record_id = p.id
)
and (
  length(trim(coalesce(p.primary_contact_email, ''))) > 0
  or length(trim(coalesce(p.primary_contact_name, ''))) > 0
  or length(trim(coalesce(p.primary_contact_phone, ''))) > 0
);

-- Enrich migrated primary rows from parent when contact-specific fields were empty.
update public.payer_credentialing_record_contacts c
set
  name =
    coalesce(nullif(trim(c.name), ''), nullif(trim(p.primary_contact_name), ''), c.name),
  role =
    coalesce(nullif(trim(c.role), ''), nullif(trim(p.primary_contact_title), ''), c.role),
  phone =
    coalesce(nullif(trim(c.phone), ''), nullif(trim(p.primary_contact_phone), ''), c.phone)
from public.payer_credentialing_records p
where p.id = c.credentialing_record_id
  and c.is_primary = true;
