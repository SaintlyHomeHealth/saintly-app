-- Internal HIPAA-oriented staff chat (separate from SMS `messages` / `conversations`).
-- Message bodies are encrypted app-side; ciphertext + nonce stored as base64 text.

create table if not exists public.internal_chats (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  chat_type text not null
    check (chat_type in ('company', 'team', 'patient', 'direct')),
  title text not null default '',
  patient_id uuid references public.patients (id) on delete cascade,
  team_role text
    check (
      team_role is null
      or team_role in (
        'super_admin', 'admin', 'manager', 'nurse', 'don', 'recruiter',
        'billing', 'dispatch', 'credentialing', 'read_only'
      )
    ),
  created_by uuid references auth.users (id) on delete set null,
  last_message_at timestamptz,
  constraint internal_chats_team_role_chk check (
    (chat_type = 'team' and team_role is not null)
    or (chat_type <> 'team' and team_role is null)
  ),
  constraint internal_chats_patient_chk check (
    (chat_type = 'patient' and patient_id is not null)
    or (chat_type <> 'patient' and patient_id is null)
  ),
  constraint internal_chats_direct_chk check (
    chat_type <> 'direct' or patient_id is null
  )
);

create unique index if not exists internal_chats_one_patient
  on public.internal_chats (patient_id)
  where patient_id is not null;

create index if not exists internal_chats_type_idx on public.internal_chats (chat_type);
create index if not exists internal_chats_last_msg_idx
  on public.internal_chats (last_message_at desc nulls last);

create table if not exists public.internal_chat_members (
  chat_id uuid not null references public.internal_chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null
    check (member_role in ('admin', 'staff', 'read_only')),
  pinned_at timestamptz,
  notifications_muted boolean not null default false,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

create index if not exists internal_chat_members_user_idx
  on public.internal_chat_members (user_id);

create table if not exists public.internal_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.internal_chats (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  ciphertext text not null,
  nonce text not null,
  attachment_path text,
  attachment_mime text,
  attachment_name text,
  mention_user_ids uuid[] not null default '{}'
);

create index if not exists internal_chat_messages_chat_created_idx
  on public.internal_chat_messages (chat_id, created_at desc);

create table if not exists public.internal_chat_message_reads (
  message_id uuid not null references public.internal_chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists internal_chat_message_reads_user_idx
  on public.internal_chat_message_reads (user_id);

create table if not exists public.internal_chat_direct_index (
  user_low uuid not null references auth.users (id) on delete cascade,
  user_high uuid not null references auth.users (id) on delete cascade,
  chat_id uuid not null references public.internal_chats (id) on delete cascade,
  primary key (user_low, user_high),
  constraint internal_chat_direct_order_chk check (user_low < user_high)
);

drop trigger if exists internal_chats_updated_at on public.internal_chats;
create trigger internal_chats_updated_at
  before update on public.internal_chats
  for each row
  execute function public.touch_conversations_updated_at();

create or replace function public.internal_chat_after_message_insert()
returns trigger
language plpgsql
as $$
begin
  update public.internal_chats
  set last_message_at = new.created_at, updated_at = now()
  where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists internal_chat_messages_after_insert on public.internal_chat_messages;
create trigger internal_chat_messages_after_insert
  after insert on public.internal_chat_messages
  for each row
  execute function public.internal_chat_after_message_insert();

create or replace function public.internal_chat_after_patient_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.internal_chats (chat_type, title, patient_id)
  values ('patient', 'Patient care team', new.id);
  return new;
end;
$$;

drop trigger if exists internal_chat_patient_after_insert on public.patients;
create trigger internal_chat_patient_after_insert
  after insert on public.patients
  for each row
  execute function public.internal_chat_after_patient_insert();

create or replace function public.internal_chat_sync_patient_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat uuid;
  v_patient uuid;
begin
  if tg_op = 'DELETE' then
    v_patient := old.patient_id;
  else
    v_patient := new.patient_id;
  end if;

  select id into v_chat from public.internal_chats
  where patient_id = v_patient and chat_type = 'patient' limit 1;

  if tg_op = 'DELETE' then
    if v_chat is not null and old.assigned_user_id is not null then
      delete from public.internal_chat_members
      where chat_id = v_chat and user_id = old.assigned_user_id;
    end if;
    return old;
  end if;

  if v_chat is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.assigned_user_id is not null
      and (
        old.assigned_user_id is distinct from new.assigned_user_id
        or new.is_active is distinct from true
      )
    then
      delete from public.internal_chat_members
      where chat_id = v_chat and user_id = old.assigned_user_id;
    end if;
  end if;

  if new.is_active is true and new.assigned_user_id is not null then
    insert into public.internal_chat_members (chat_id, user_id, member_role)
    values (v_chat, new.assigned_user_id, 'staff')
    on conflict (chat_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists internal_chat_patient_assignment_ins on public.patient_assignments;
create trigger internal_chat_patient_assignment_ins
  after insert on public.patient_assignments
  for each row
  execute function public.internal_chat_sync_patient_assignment();

drop trigger if exists internal_chat_patient_assignment_upd on public.patient_assignments;
create trigger internal_chat_patient_assignment_upd
  after update on public.patient_assignments
  for each row
  execute function public.internal_chat_sync_patient_assignment();

drop trigger if exists internal_chat_patient_assignment_del on public.patient_assignments;
create trigger internal_chat_patient_assignment_del
  after delete on public.patient_assignments
  for each row
  execute function public.internal_chat_sync_patient_assignment();

create or replace function public.internal_chat_staff_company_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat uuid;
  v_role text;
begin
  if new.is_active is not true then
    return new;
  end if;
  select id into v_chat from public.internal_chats where chat_type = 'company' limit 1;
  if v_chat is null then
    return new;
  end if;
  v_role := case
    when new.role in ('super_admin', 'admin') then 'admin'
    else 'staff'
  end;
  insert into public.internal_chat_members (chat_id, user_id, member_role)
  values (v_chat, new.user_id, v_role::text)
  on conflict (chat_id, user_id) do update
    set member_role = excluded.member_role;
  return new;
end;
$$;

drop trigger if exists internal_chat_staff_after_ins on public.staff_profiles;
create trigger internal_chat_staff_after_ins
  after insert on public.staff_profiles
  for each row
  execute function public.internal_chat_staff_company_member();

drop trigger if exists internal_chat_staff_after_upd on public.staff_profiles;
create trigger internal_chat_staff_after_upd
  after update on public.staff_profiles
  for each row
  when (new.is_active is distinct from old.is_active or new.role is distinct from old.role)
  execute function public.internal_chat_staff_company_member();

create or replace function public.internal_chat_staff_team_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active is not true then
    return new;
  end if;
  insert into public.internal_chat_members (chat_id, user_id, member_role)
  select ic.id, new.user_id, 'staff'::text
  from public.internal_chats ic
  where ic.chat_type = 'team'
    and ic.team_role = new.role
  on conflict (chat_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists internal_chat_staff_team_ins on public.staff_profiles;
create trigger internal_chat_staff_team_ins
  after insert on public.staff_profiles
  for each row
  execute function public.internal_chat_staff_team_channels();

drop trigger if exists internal_chat_staff_team_upd on public.staff_profiles;
create trigger internal_chat_staff_team_upd
  after update on public.staff_profiles
  for each row
  when (new.is_active is distinct from old.is_active or new.role is distinct from old.role)
  execute function public.internal_chat_staff_team_channels();

insert into public.internal_chats (chat_type, title)
select 'company', 'Everyone'
where not exists (select 1 from public.internal_chats where chat_type = 'company');

insert into public.internal_chat_members (chat_id, user_id, member_role)
select c.id, sp.user_id,
  case when sp.role in ('super_admin', 'admin') then 'admin' else 'staff' end::text
from public.internal_chats c
cross join public.staff_profiles sp
where c.chat_type = 'company'
  and sp.is_active = true
on conflict (chat_id, user_id) do nothing;

insert into public.internal_chats (chat_type, title, patient_id)
select 'patient', 'Patient care team', p.id
from public.patients p
where not exists (
  select 1 from public.internal_chats ic where ic.patient_id = p.id
);

insert into public.internal_chat_members (chat_id, user_id, member_role)
select ic.id, pa.assigned_user_id, 'staff'::text
from public.patient_assignments pa
join public.internal_chats ic on ic.patient_id = pa.patient_id and ic.chat_type = 'patient'
where pa.is_active = true
  and pa.assigned_user_id is not null
on conflict (chat_id, user_id) do nothing;

alter table public.internal_chats enable row level security;
alter table public.internal_chat_members enable row level security;
alter table public.internal_chat_messages enable row level security;
alter table public.internal_chat_message_reads enable row level security;
alter table public.internal_chat_direct_index enable row level security;

drop policy if exists "internal_chats_select_member" on public.internal_chats;
create policy "internal_chats_select_member"
  on public.internal_chats
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_chat_members m
      where m.chat_id = internal_chats.id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "internal_chat_members_select" on public.internal_chat_members;
create policy "internal_chat_members_select"
  on public.internal_chat_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.internal_chat_members self
      where self.chat_id = internal_chat_members.chat_id
        and self.user_id = (select auth.uid())
    )
  );

drop policy if exists "internal_chat_members_update_self" on public.internal_chat_members;
create policy "internal_chat_members_update_self"
  on public.internal_chat_members
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "internal_chat_messages_select" on public.internal_chat_messages;
create policy "internal_chat_messages_select"
  on public.internal_chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.internal_chat_members m
      where m.chat_id = internal_chat_messages.chat_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "internal_chat_reads_select" on public.internal_chat_message_reads;
create policy "internal_chat_reads_select"
  on public.internal_chat_message_reads
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.internal_chat_messages msg
      join public.internal_chat_members m on m.chat_id = msg.chat_id
      where msg.id = internal_chat_message_reads.message_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "internal_chat_reads_insert" on public.internal_chat_message_reads;
create policy "internal_chat_reads_insert"
  on public.internal_chat_message_reads
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.internal_chat_messages msg
      join public.internal_chat_members m on m.chat_id = msg.chat_id
      where msg.id = internal_chat_message_reads.message_id
        and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "internal_chat_reads_update" on public.internal_chat_message_reads;
create policy "internal_chat_reads_update"
  on public.internal_chat_message_reads
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "internal_chat_dm_index_select" on public.internal_chat_direct_index;
create policy "internal_chat_dm_index_select"
  on public.internal_chat_direct_index
  for select
  to authenticated
  using (
    user_low = (select auth.uid())
    or user_high = (select auth.uid())
  );

insert into storage.buckets (id, name, public)
values ('internal-chat', 'internal-chat', false)
on conflict (id) do nothing;

drop policy if exists "internal_chat_storage_select" on storage.objects;
create policy "internal_chat_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'internal-chat'
    and exists (
      select 1 from public.internal_chat_members m
      where m.user_id = (select auth.uid())
        and m.chat_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "internal_chat_storage_insert" on storage.objects;
create policy "internal_chat_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'internal-chat'
    and exists (
      select 1 from public.internal_chat_members m
      where m.user_id = (select auth.uid())
        and m.member_role <> 'read_only'
        and m.chat_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "internal_chat_storage_delete" on storage.objects;
create policy "internal_chat_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'internal-chat'
    and exists (
      select 1 from public.internal_chat_members m
      where m.user_id = (select auth.uid())
        and m.member_role = 'admin'
        and m.chat_id::text = (storage.foldername(name))[1]
    )
  );

alter publication supabase_realtime add table public.internal_chat_messages;
alter publication supabase_realtime add table public.internal_chats;
alter publication supabase_realtime add table public.internal_chat_members;
