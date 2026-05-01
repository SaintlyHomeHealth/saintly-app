-- Staff-assigned Twilio numbers + per-event SMS/call ownership for inbox isolation.

create table if not exists public.twilio_phone_numbers (
  id uuid primary key default gen_random_uuid (),
  phone_number text not null unique,
  twilio_sid text not null unique,
  label text,
  number_type text not null default 'staff_direct',
  status text not null default 'available',
  assigned_user_id uuid references auth.users (id) on delete set null,
  assigned_staff_profile_id uuid references public.staff_profiles (id) on delete set null,
  is_primary_company_number boolean not null default false,
  sms_enabled boolean not null default true,
  voice_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint twilio_phone_numbers_status_check check (
    status in ('available', 'assigned', 'retired')
  )
);

create index if not exists twilio_phone_numbers_assigned_user_idx
  on public.twilio_phone_numbers (assigned_user_id)
  where assigned_user_id is not null;

create index if not exists twilio_phone_numbers_phone_number_idx
  on public.twilio_phone_numbers (phone_number);

create unique index if not exists twilio_phone_numbers_one_assigned_user_live
  on public.twilio_phone_numbers (assigned_user_id)
  where assigned_user_id is not null and status = 'assigned';

create unique index if not exists twilio_phone_numbers_one_company_primary
  on public.twilio_phone_numbers (is_primary_company_number)
  where is_primary_company_number = true;

create table if not exists public.twilio_phone_number_assignments (
  id uuid primary key default gen_random_uuid (),
  phone_number_id uuid not null references public.twilio_phone_numbers (id) on delete cascade,
  assigned_from_user_id uuid references auth.users (id) on delete set null,
  assigned_to_user_id uuid references auth.users (id) on delete set null,
  assigned_by_user_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists twilio_phone_number_assignments_phone_idx
  on public.twilio_phone_number_assignments (phone_number_id, created_at desc);

-- Ownership columns first without FKs; validated backfill + cleanup, then constraints (stale metadata UUIDs must not fail migration).
alter table public.messages
  add column if not exists owner_user_id uuid;

alter table public.messages
  add column if not exists owner_staff_profile_id uuid;

alter table public.messages
  add column if not exists from_number text;

alter table public.messages
  add column if not exists to_number text;

alter table public.messages
  add column if not exists twilio_phone_number_id uuid references public.twilio_phone_numbers (id) on delete set null;

create index if not exists messages_owner_user_idx
  on public.messages (owner_user_id)
  where owner_user_id is not null;

alter table public.phone_calls
  add column if not exists owner_user_id uuid;

alter table public.phone_calls
  add column if not exists owner_staff_profile_id uuid;

alter table public.phone_calls
  add column if not exists twilio_phone_number_id uuid references public.twilio_phone_numbers (id) on delete set null;

create index if not exists phone_calls_owner_user_idx
  on public.phone_calls (owner_user_id)
  where owner_user_id is not null;

create or replace function public.touch_twilio_phone_numbers_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists twilio_phone_numbers_updated_at on public.twilio_phone_numbers;

create trigger twilio_phone_numbers_updated_at
  before update on public.twilio_phone_numbers
  for each row
  execute function public.touch_twilio_phone_numbers_updated_at ();

-- Historical alignment (best-effort): only set owner_user_id when it resolves to auth.users or via staff_profiles.id → user_id.

-- Outbound: metadata.sent_by_user_id
update public.messages m
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = (nullif(trim(m.metadata ->> 'sent_by_user_id'), ''))::uuid
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(m.metadata ->> 'sent_by_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    m.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = (
          select u.id
          from auth.users u
          where
            u.id = (nullif(trim(m.metadata ->> 'sent_by_user_id'), ''))::uuid
          limit 1
        )
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(m.metadata ->> 'sent_by_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  )
where
  m.direction = 'outbound'
  and m.owner_user_id is null
  and nullif(trim(m.metadata ->> 'sent_by_user_id'), '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Outbound: metadata.sender_user_id
update public.messages m
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = (nullif(trim(m.metadata ->> 'sender_user_id'), ''))::uuid
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(m.metadata ->> 'sender_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    m.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = (
          select u.id
          from auth.users u
          where
            u.id = (nullif(trim(m.metadata ->> 'sender_user_id'), ''))::uuid
          limit 1
        )
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(m.metadata ->> 'sender_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  )
where
  m.direction = 'outbound'
  and m.owner_user_id is null
  and nullif(trim(m.metadata ->> 'sender_user_id'), '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Outbound: metadata.user_id
update public.messages m
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = (nullif(trim(m.metadata ->> 'user_id'), ''))::uuid
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(m.metadata ->> 'user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    m.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = (
          select u.id
          from auth.users u
          where
            u.id = (nullif(trim(m.metadata ->> 'user_id'), ''))::uuid
          limit 1
        )
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(m.metadata ->> 'user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  )
where
  m.direction = 'outbound'
  and m.owner_user_id is null
  and nullif(trim(m.metadata ->> 'user_id'), '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Inbound: conversations.assigned_to_user_id (may be auth user id or mistaken staff_profiles.id)
update public.messages m
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = c.assigned_to_user_id
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = c.assigned_to_user_id
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    m.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = c.assigned_to_user_id
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = c.assigned_to_user_id
        and sp.user_id is not null
      limit 1
    )
  )
from
  public.conversations c
where
  m.conversation_id = c.id
  and m.direction = 'inbound'
  and m.owner_user_id is null
  and c.assigned_to_user_id is not null;

-- phone_calls: assigned_to_user_id
update public.phone_calls pc
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = pc.assigned_to_user_id
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = pc.assigned_to_user_id
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = pc.assigned_to_user_id
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = pc.assigned_to_user_id
        and sp.user_id is not null
      limit 1
    )
  )
where
  pc.owner_user_id is null
  and pc.assigned_to_user_id is not null;

-- phone_calls outbound: metadata keys (same rules as messages)
update public.phone_calls pc
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = (nullif(trim(pc.metadata ->> 'sent_by_user_id'), ''))::uuid
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(pc.metadata ->> 'sent_by_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    pc.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = (
          select u.id
          from auth.users u
          where
            u.id = (nullif(trim(pc.metadata ->> 'sent_by_user_id'), ''))::uuid
          limit 1
        )
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(pc.metadata ->> 'sent_by_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  )
where
  pc.direction = 'outbound'
  and pc.owner_user_id is null
  and nullif(trim(pc.metadata ->> 'sent_by_user_id'), '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update public.phone_calls pc
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = (nullif(trim(pc.metadata ->> 'sender_user_id'), ''))::uuid
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(pc.metadata ->> 'sender_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    pc.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = (
          select u.id
          from auth.users u
          where
            u.id = (nullif(trim(pc.metadata ->> 'sender_user_id'), ''))::uuid
          limit 1
        )
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(pc.metadata ->> 'sender_user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  )
where
  pc.direction = 'outbound'
  and pc.owner_user_id is null
  and nullif(trim(pc.metadata ->> 'sender_user_id'), '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

update public.phone_calls pc
set
  owner_user_id = coalesce(
    (
      select u.id
      from auth.users u
      where
        u.id = (nullif(trim(pc.metadata ->> 'user_id'), ''))::uuid
      limit 1
    ),
    (
      select sp.user_id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(pc.metadata ->> 'user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  ),
  owner_staff_profile_id = coalesce(
    pc.owner_staff_profile_id,
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.user_id = (
          select u.id
          from auth.users u
          where
            u.id = (nullif(trim(pc.metadata ->> 'user_id'), ''))::uuid
          limit 1
        )
      limit 1
    ),
    (
      select sp.id
      from public.staff_profiles sp
      where
        sp.id = (nullif(trim(pc.metadata ->> 'user_id'), ''))::uuid
        and sp.user_id is not null
      limit 1
    )
  )
where
  pc.direction = 'outbound'
  and pc.owner_user_id is null
  and nullif(trim(pc.metadata ->> 'user_id'), '')
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- Final cleanup before FKs: drop orphan owner pointers (defense in depth).
update public.messages m
set
  owner_user_id = null
where
  m.owner_user_id is not null
  and not exists (
    select 1
    from auth.users u
    where
      u.id = m.owner_user_id
  );

update public.messages m
set
  owner_staff_profile_id = null
where
  m.owner_staff_profile_id is not null
  and not exists (
    select 1
    from public.staff_profiles sp
    where
      sp.id = m.owner_staff_profile_id
  );

update public.phone_calls pc
set
  owner_user_id = null
where
  pc.owner_user_id is not null
  and not exists (
    select 1
    from auth.users u
    where
      u.id = pc.owner_user_id
  );

update public.phone_calls pc
set
  owner_staff_profile_id = null
where
  pc.owner_staff_profile_id is not null
  and not exists (
    select 1
    from public.staff_profiles sp
    where
      sp.id = pc.owner_staff_profile_id
  );

alter table public.messages
  drop constraint if exists messages_owner_user_id_fkey;

alter table public.messages
  add constraint messages_owner_user_id_fkey foreign key (owner_user_id) references auth.users (id) on delete set null;

alter table public.messages
  drop constraint if exists messages_owner_staff_profile_id_fkey;

alter table public.messages
  add constraint messages_owner_staff_profile_id_fkey foreign key (owner_staff_profile_id) references public.staff_profiles (id) on delete set null;

alter table public.phone_calls
  drop constraint if exists phone_calls_owner_user_id_fkey;

alter table public.phone_calls
  add constraint phone_calls_owner_user_id_fkey foreign key (owner_user_id) references auth.users (id) on delete set null;

alter table public.phone_calls
  drop constraint if exists phone_calls_owner_staff_profile_id_fkey;

alter table public.phone_calls
  add constraint phone_calls_owner_staff_profile_id_fkey foreign key (owner_staff_profile_id) references public.staff_profiles (id) on delete set null;

comment on column public.messages.owner_user_id is
  'Staff/auth user who owns this SMS event for isolation; NULL = company/admin pool only.';

comment on column public.phone_calls.owner_user_id is
  'Staff/auth user who owns this call row for isolation; NULL = company/admin pool only.';

-- RPC must respect row visibility (SECURITY INVOKER).
create or replace function public.sms_conversation_ids_with_messages (conversation_ids uuid[])
returns table (conversation_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct m.conversation_id
  from public.messages m
  where m.conversation_id = any (conversation_ids)
    and m.message_type = 'sms'
    and m.deleted_at is null;
$$;

grant execute on function public.sms_conversation_ids_with_messages (uuid[]) to authenticated, service_role;

alter table public.twilio_phone_numbers enable row level security;

drop policy if exists "twilio_phone_numbers_admin_select" on public.twilio_phone_numbers;

create policy "twilio_phone_numbers_admin_select"
  on public.twilio_phone_numbers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.role in ('super_admin', 'admin')
        and sp.is_active is distinct from false
    )
  );

drop policy if exists "twilio_phone_numbers_admin_mutate" on public.twilio_phone_numbers;

create policy "twilio_phone_numbers_admin_mutate"
  on public.twilio_phone_numbers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.role in ('super_admin', 'admin')
        and sp.is_active is distinct from false
    )
  )
  with check (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.role in ('super_admin', 'admin')
        and sp.is_active is distinct from false
    )
  );

alter table public.twilio_phone_number_assignments enable row level security;

drop policy if exists "twilio_phone_number_assignments_admin_select" on public.twilio_phone_number_assignments;

create policy "twilio_phone_number_assignments_admin_select"
  on public.twilio_phone_number_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.role in ('super_admin', 'admin')
        and sp.is_active is distinct from false
    )
  );

-- Phone workspace roles with org-wide SMS/call visibility (matches app hasFullCallVisibility).
create or replace function public.staff_has_full_phone_visibility ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = (select auth.uid ())
      and sp.is_active is distinct from false
      and sp.role in (
        'super_admin',
        'admin',
        'manager',
        'don',
        'recruiter',
        'billing',
        'dispatch',
        'credentialing'
      )
  );
$$;

grant execute on function public.staff_has_full_phone_visibility () to authenticated, service_role;

drop policy if exists "conversations_select_staff" on public.conversations;

create policy "conversations_select_staff"
  on public.conversations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.is_active is distinct from false
        and sp.role <> 'read_only'
        and sp.role in (
          'super_admin',
          'admin',
          'manager',
          'nurse',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
    and (
      public.staff_has_full_phone_visibility ()
      or assigned_to_user_id = (select auth.uid ())
      or exists (
        select 1
        from public.messages m
        where m.conversation_id = conversations.id
          and m.owner_user_id = (select auth.uid ())
          and m.deleted_at is null
      )
    )
  );

drop policy if exists "messages_select_staff" on public.messages;

create policy "messages_select_staff"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.is_active is distinct from false
        and sp.role <> 'read_only'
        and sp.role in (
          'super_admin',
          'admin',
          'manager',
          'nurse',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
    and (
      public.staff_has_full_phone_visibility ()
      or (
        owner_user_id is not null
        and owner_user_id = (select auth.uid ())
      )
    )
  );

drop policy if exists "phone_calls_select_staff" on public.phone_calls;

create policy "phone_calls_select_staff"
  on public.phone_calls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.is_active is distinct from false
        and sp.role <> 'read_only'
        and sp.role in (
          'super_admin',
          'admin',
          'manager',
          'nurse',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
    and (
      public.staff_has_full_phone_visibility ()
      or (
        owner_user_id is not null
        and owner_user_id = (select auth.uid ())
      )
    )
  );
