-- Multi-email + enriched primary contact fields for payer_credentialing_records.
-- Backfills legacy primary_contact_email into payer_credentialing_record_emails.

-- ---------------------------------------------------------------------------
-- Optional labels (app-enforced; column is free text for flexibility)
-- ---------------------------------------------------------------------------

create table if not exists public.payer_credentialing_record_emails (
  id uuid primary key default gen_random_uuid(),
  credentialing_record_id uuid not null
    references public.payer_credentialing_records (id) on delete cascade,
  email text not null,
  label text,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint payer_cred_record_emails_email_nonempty check (length(trim(email)) > 0)
);

create index if not exists payer_cred_record_emails_record_idx
  on public.payer_credentialing_record_emails (credentialing_record_id, sort_order, created_at);

create unique index if not exists payer_cred_record_emails_one_primary_per_record
  on public.payer_credentialing_record_emails (credentialing_record_id)
  where is_primary = true;

comment on table public.payer_credentialing_record_emails is
  'Additional and primary email addresses for the payer primary contact; primary_contact_email on the parent row mirrors the primary row for legacy queries.';

alter table public.payer_credentialing_record_emails enable row level security;

drop policy if exists "payer_cred_record_emails_select_staff" on public.payer_credentialing_record_emails;
create policy "payer_cred_record_emails_select_staff"
  on public.payer_credentialing_record_emails for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_record_emails_insert_staff" on public.payer_credentialing_record_emails;
create policy "payer_cred_record_emails_insert_staff"
  on public.payer_credentialing_record_emails for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "payer_cred_record_emails_update_staff" on public.payer_credentialing_record_emails;
create policy "payer_cred_record_emails_update_staff"
  on public.payer_credentialing_record_emails for update to authenticated
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

drop policy if exists "payer_cred_record_emails_delete_staff" on public.payer_credentialing_record_emails;
create policy "payer_cred_record_emails_delete_staff"
  on public.payer_credentialing_record_emails for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Parent row: contact metadata (single primary contact person)
-- ---------------------------------------------------------------------------

alter table public.payer_credentialing_records
  add column if not exists primary_contact_title text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_department text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_phone_direct text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_fax text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_website text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_notes text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_last_contacted_at timestamptz;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_preferred_method text;

alter table public.payer_credentialing_records
  add column if not exists primary_contact_status text not null default 'active';

alter table public.payer_credentialing_records
  drop constraint if exists payer_cred_primary_contact_status_check;

alter table public.payer_credentialing_records
  add constraint payer_cred_primary_contact_status_check
  check (primary_contact_status in ('active', 'inactive'));

alter table public.payer_credentialing_records
  drop constraint if exists payer_cred_primary_contact_pref_check;

alter table public.payer_credentialing_records
  add constraint payer_cred_primary_contact_pref_check
  check (
    primary_contact_preferred_method is null
    or primary_contact_preferred_method in ('phone', 'email', 'fax')
  );

-- ---------------------------------------------------------------------------
-- Backfill: one primary email row per legacy primary_contact_email
-- ---------------------------------------------------------------------------

insert into public.payer_credentialing_record_emails (credentialing_record_id, email, is_primary, sort_order)
select
  p.id,
  trim(p.primary_contact_email),
  true,
  0
from public.payer_credentialing_records p
where p.primary_contact_email is not null
  and trim(p.primary_contact_email) <> ''
  and not exists (
    select 1 from public.payer_credentialing_record_emails e
    where e.credentialing_record_id = p.id and e.is_primary = true
  );
