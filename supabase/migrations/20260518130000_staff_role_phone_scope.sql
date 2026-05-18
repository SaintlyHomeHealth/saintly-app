-- Limited "staff" role: workspace phone scoped to assigned Twilio numbers only (not org-wide).

alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (
    role in (
      'super_admin',
      'admin',
      'manager',
      'nurse',
      'staff',
      'don',
      'recruiter',
      'billing',
      'dispatch',
      'credentialing',
      'read_only'
    )
  );

create or replace function public.staff_is_assigned_phone_scoped_role ()
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
      and sp.role = 'staff'
  );
$$;

create or replace function public.auth_assigned_twilio_phone_number_ids ()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tpn.id
  from public.twilio_phone_numbers tpn
  where tpn.assigned_user_id = (select auth.uid ())
    and tpn.status = 'assigned';
$$;

create or replace function public.auth_assigned_twilio_phone_e164s ()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select tpn.phone_number
  from public.twilio_phone_numbers tpn
  where tpn.assigned_user_id = (select auth.uid ())
    and tpn.status = 'assigned';
$$;

create or replace function public.message_matches_assigned_phone_scope (m public.messages)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      m.twilio_phone_number_id is not null
      and m.twilio_phone_number_id in (select public.auth_assigned_twilio_phone_number_ids ())
    )
    or (
      m.from_number is not null
      and m.from_number in (select public.auth_assigned_twilio_phone_e164s ())
    )
    or (
      m.to_number is not null
      and m.to_number in (select public.auth_assigned_twilio_phone_e164s ())
    );
$$;

create or replace function public.phone_call_matches_assigned_phone_scope (pc public.phone_calls)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      pc.twilio_phone_number_id is not null
      and pc.twilio_phone_number_id in (select public.auth_assigned_twilio_phone_number_ids ())
    )
    or (
      pc.from_e164 is not null
      and pc.from_e164 in (select public.auth_assigned_twilio_phone_e164s ())
    )
    or (
      pc.to_e164 is not null
      and pc.to_e164 in (select public.auth_assigned_twilio_phone_e164s ())
    );
$$;

create or replace function public.conversation_matches_assigned_phone_scope (c public.conversations)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messages m
    where m.conversation_id = c.id
      and m.deleted_at is null
      and public.message_matches_assigned_phone_scope (m)
  );
$$;

grant execute on function public.staff_is_assigned_phone_scoped_role () to authenticated, service_role;
grant execute on function public.auth_assigned_twilio_phone_number_ids () to authenticated, service_role;
grant execute on function public.auth_assigned_twilio_phone_e164s () to authenticated, service_role;
grant execute on function public.message_matches_assigned_phone_scope (public.messages) to authenticated, service_role;
grant execute on function public.phone_call_matches_assigned_phone_scope (public.phone_calls) to authenticated, service_role;
grant execute on function public.conversation_matches_assigned_phone_scope (public.conversations) to authenticated, service_role;

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
          'staff',
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
        public.staff_is_assigned_phone_scoped_role ()
        and public.conversation_matches_assigned_phone_scope (conversations)
      )
      or (
        not public.staff_is_assigned_phone_scoped_role ()
        and (
          assigned_to_user_id = (select auth.uid ())
          or exists (
            select 1
            from public.messages m
            where m.conversation_id = conversations.id
              and m.owner_user_id = (select auth.uid ())
              and m.deleted_at is null
          )
        )
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
          'staff',
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
        public.staff_is_assigned_phone_scoped_role ()
        and public.message_matches_assigned_phone_scope (messages)
      )
      or (
        not public.staff_is_assigned_phone_scoped_role ()
        and owner_user_id is not null
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
          'staff',
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
        public.staff_is_assigned_phone_scoped_role ()
        and public.phone_call_matches_assigned_phone_scope (phone_calls)
      )
      or (
        not public.staff_is_assigned_phone_scoped_role ()
        and (
          (
            owner_user_id is not null
            and owner_user_id = (select auth.uid ())
          )
          or assigned_to_user_id = (select auth.uid ())
          or assigned_to_user_id is null
          or direction = 'inbound'
        )
      )
    )
  );

drop policy if exists "phone_message_attachments_select_staff" on public.phone_message_attachments;

create policy "phone_message_attachments_select_staff"
  on public.phone_message_attachments
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
          'staff',
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
        public.staff_is_assigned_phone_scoped_role ()
        and exists (
          select 1
          from public.messages m
          where m.id = phone_message_attachments.message_id
            and public.message_matches_assigned_phone_scope (m)
        )
      )
      or (
        not public.staff_is_assigned_phone_scoped_role ()
        and exists (
          select 1
          from public.messages m
          where m.id = phone_message_attachments.message_id
            and m.owner_user_id is not null
            and m.owner_user_id = (select auth.uid ())
        )
      )
    )
  );
