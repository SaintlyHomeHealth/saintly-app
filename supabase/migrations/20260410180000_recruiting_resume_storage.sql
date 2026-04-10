-- Recruiting CRM: resume file metadata + private Storage bucket `recruiting-resumes`.
-- Uses IF EXISTS so this file can be run before 20260410163000 without failing (no-op until table exists).

alter table if exists public.recruiting_candidates
  add column if not exists resume_file_name text;

alter table if exists public.recruiting_candidates
  add column if not exists resume_storage_path text;

alter table if exists public.recruiting_candidates
  add column if not exists resume_uploaded_at timestamptz;

do $resume_meta$
begin
  if to_regclass('public.recruiting_candidates') is null then
    raise notice 'Skipping resume column comments: recruiting_candidates not found.';
    return;
  end if;
  execute $c1$
    comment on column public.recruiting_candidates.resume_file_name is 'Original filename of the uploaded resume.';
  $c1$;
  execute $c2$
    comment on column public.recruiting_candidates.resume_storage_path is 'Object path in Storage bucket recruiting-resumes.';
  $c2$;
  execute $c3$
    comment on column public.recruiting_candidates.resume_uploaded_at is 'When the current resume file was uploaded.';
  $c3$;
end;
$resume_meta$;

insert into storage.buckets (id, name, public)
values ('recruiting-resumes', 'recruiting-resumes', false)
on conflict (id) do nothing;

-- Paths: {candidate_id}/{timestamp}-{sanitized_filename}

drop policy if exists "recruiting_resumes_storage_select_staff" on storage.objects;
drop policy if exists "recruiting_resumes_storage_insert_staff" on storage.objects;
drop policy if exists "recruiting_resumes_storage_update_staff" on storage.objects;
drop policy if exists "recruiting_resumes_storage_delete_staff" on storage.objects;

create policy "recruiting_resumes_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recruiting-resumes'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "recruiting_resumes_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recruiting-resumes'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "recruiting_resumes_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recruiting-resumes'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'recruiting-resumes'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "recruiting_resumes_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recruiting-resumes'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
