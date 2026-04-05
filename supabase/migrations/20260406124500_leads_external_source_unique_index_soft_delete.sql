-- Partial unique index for Facebook dedupe + soft-delete. Runs only when external_source_id and deleted_at exist.
-- Apply 20260405140000_leads_external_source_metadata.sql first if external_source_id is missing.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'external_source_id'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'deleted_at'
  ) then
    drop index if exists public.leads_source_external_source_id_uidx;
    create unique index if not exists leads_source_external_source_id_uidx
      on public.leads (source, external_source_id)
      where external_source_id is not null and deleted_at is null;
  end if;
end $$;
