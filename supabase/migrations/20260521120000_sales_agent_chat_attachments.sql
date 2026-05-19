-- Sales Agent chat attachments (private storage, signed URLs via app routes).

-- Allow attachment-only messages (empty body text).
alter table public.sales_agent_messages
  drop constraint if exists sales_agent_messages_body_check;

alter table public.sales_agent_messages
  add constraint sales_agent_messages_body_check
  check (body is not null);

insert into storage.buckets (id, name, public)
values ('sales-agent-chat-attachments', 'sales-agent-chat-attachments', false)
on conflict (id) do nothing;

create table if not exists public.sales_agent_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.sales_agent_messages (id) on delete cascade,
  sales_agent_user_id uuid not null references auth.users (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id) on delete cascade,
  storage_bucket text not null default 'sales-agent-chat-attachments',
  storage_path text not null,
  file_name text null,
  mime_type text null,
  file_size_bytes integer null,
  created_at timestamptz not null default now()
);

create index if not exists sales_agent_message_attachments_message_idx
  on public.sales_agent_message_attachments (message_id);

create index if not exists sales_agent_message_attachments_agent_idx
  on public.sales_agent_message_attachments (sales_agent_user_id, created_at desc);

comment on table public.sales_agent_message_attachments is
  'Sales agent chat files in private storage; PHI — signed URLs only via app routes.';

create or replace function public.sales_agent_message_attachments_thread_match()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.sales_agent_messages m
    where m.id = new.message_id
      and m.sales_agent_user_id = new.sales_agent_user_id
  ) then
    raise exception 'sales_agent_user_id must match sales_agent_messages.sales_agent_user_id';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_agent_message_attachments_thread_match on public.sales_agent_message_attachments;
create trigger sales_agent_message_attachments_thread_match
  before insert or update on public.sales_agent_message_attachments
  for each row
  execute function public.sales_agent_message_attachments_thread_match();

alter table public.sales_agent_message_attachments enable row level security;

drop policy if exists "sales_agent_message_attachments_select_agent" on public.sales_agent_message_attachments;
create policy "sales_agent_message_attachments_select_agent"
  on public.sales_agent_message_attachments for select to authenticated
  using (
    public.staff_is_sales_agent()
    and sales_agent_user_id = auth.uid()
  );

drop policy if exists "sales_agent_message_attachments_insert_agent" on public.sales_agent_message_attachments;
create policy "sales_agent_message_attachments_insert_agent"
  on public.sales_agent_message_attachments for insert to authenticated
  with check (
    public.staff_is_sales_agent()
    and sales_agent_user_id = auth.uid()
    and uploaded_by = auth.uid()
  );

drop policy if exists "sales_agent_message_attachments_select_manager" on public.sales_agent_message_attachments;
create policy "sales_agent_message_attachments_select_manager"
  on public.sales_agent_message_attachments for select to authenticated
  using (public.staff_is_crm_leads_manager());

drop policy if exists "sales_agent_message_attachments_insert_manager" on public.sales_agent_message_attachments;
create policy "sales_agent_message_attachments_insert_manager"
  on public.sales_agent_message_attachments for insert to authenticated
  with check (
    public.staff_is_crm_leads_manager()
    and uploaded_by = auth.uid()
  );

drop policy if exists "sales_agent_chat_attachments_storage_select" on storage.objects;
create policy "sales_agent_chat_attachments_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sales-agent-chat-attachments'
    and (
      public.staff_is_crm_leads_manager()
      or (
        public.staff_is_sales_agent()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );

drop policy if exists "sales_agent_chat_attachments_storage_insert" on storage.objects;
create policy "sales_agent_chat_attachments_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sales-agent-chat-attachments'
    and (
      public.staff_is_crm_leads_manager()
      or (
        public.staff_is_sales_agent()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );

drop policy if exists "sales_agent_chat_attachments_storage_delete" on storage.objects;
create policy "sales_agent_chat_attachments_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sales-agent-chat-attachments'
    and (
      public.staff_is_crm_leads_manager()
      or (
        public.staff_is_sales_agent()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
    )
  );
