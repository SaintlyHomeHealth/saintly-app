-- Fax Center: reusable document templates (pasted text and/or optional attachment file).

create table if not exists public.fax_document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body_content text not null default '',
  attachment_storage_bucket text,
  attachment_storage_path text,
  attachment_file_name text,
  attachment_content_type text,
  attachment_size_bytes bigint,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fax_document_templates_name_idx
  on public.fax_document_templates (name);

create index if not exists fax_document_templates_updated_idx
  on public.fax_document_templates (updated_at desc);

drop trigger if exists fax_document_templates_updated_at on public.fax_document_templates;
create trigger fax_document_templates_updated_at
  before update on public.fax_document_templates
  for each row
  execute function public.touch_fax_updated_at();

alter table public.fax_document_templates enable row level security;

drop policy if exists "fax_document_templates_select_staff" on public.fax_document_templates;
create policy "fax_document_templates_select_staff"
  on public.fax_document_templates for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_document_templates_write_staff" on public.fax_document_templates;
create policy "fax_document_templates_write_staff"
  on public.fax_document_templates for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

comment on table public.fax_document_templates is
  'Reusable fax document templates: pasted body text and/or an optional attachment file (PDF/image).';
