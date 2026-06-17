-- Link manual resume uploads (recruiting_candidates) to unified recruiting leads pipeline.

alter table public.recruiting_candidates
  add column if not exists recruiting_lead_id uuid references public.facebook_recruiting_leads (id) on delete set null;

create index if not exists recruiting_candidates_recruiting_lead_id_idx
  on public.recruiting_candidates (recruiting_lead_id)
  where recruiting_lead_id is not null;

comment on column public.recruiting_candidates.recruiting_lead_id is
  'Unified recruiting pipeline lead (facebook_recruiting_leads). Website, Facebook, and manual resume uploads share this.';

create table if not exists public.recruiting_lead_resume_documents (
  id uuid primary key default gen_random_uuid(),
  recruiting_lead_id uuid not null references public.facebook_recruiting_leads (id) on delete cascade,
  recruiting_candidate_id uuid references public.recruiting_candidates (id) on delete set null,
  storage_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users (id) on delete set null,
  source text not null default 'manual_resume_upload',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists recruiting_lead_resume_documents_lead_path_uidx
  on public.recruiting_lead_resume_documents (recruiting_lead_id, storage_path);

create index if not exists recruiting_lead_resume_documents_lead_uploaded_idx
  on public.recruiting_lead_resume_documents (recruiting_lead_id, uploaded_at desc);

comment on table public.recruiting_lead_resume_documents is
  'Resume files attached to unified recruiting leads (supports multiple uploads per person).';

alter table public.recruiting_lead_resume_documents enable row level security;

drop policy if exists "recruiting_lead_resume_documents_select_staff" on public.recruiting_lead_resume_documents;
create policy "recruiting_lead_resume_documents_select_staff"
  on public.recruiting_lead_resume_documents for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_lead_resume_documents_insert_staff" on public.recruiting_lead_resume_documents;
create policy "recruiting_lead_resume_documents_insert_staff"
  on public.recruiting_lead_resume_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
