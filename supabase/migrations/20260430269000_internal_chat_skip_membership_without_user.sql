-- Placeholder staff (user_id null) must not insert into internal_chat_members (user_id NOT NULL).
-- When login is linked later, UPDATE triggers backfill company + team channel membership.

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
  if new.user_id is null then
    return new;
  end if;
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

create or replace function public.internal_chat_staff_team_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;
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

drop trigger if exists internal_chat_staff_after_upd on public.staff_profiles;
create trigger internal_chat_staff_after_upd
  after update on public.staff_profiles
  for each row
  when (
    new.is_active is distinct from old.is_active
    or new.role is distinct from old.role
    or new.user_id is distinct from old.user_id
  )
  execute function public.internal_chat_staff_company_member();

drop trigger if exists internal_chat_staff_team_upd on public.staff_profiles;
create trigger internal_chat_staff_team_upd
  after update on public.staff_profiles
  for each row
  when (
    new.is_active is distinct from old.is_active
    or new.role is distinct from old.role
    or new.user_id is distinct from old.user_id
  )
  execute function public.internal_chat_staff_team_channels();

comment on function public.internal_chat_staff_company_member() is
  'Adds/updates company (Everyone) chat membership when staff has user_id and is active; skips placeholders.';

comment on function public.internal_chat_staff_team_channels() is
  'Adds role-matching team channel memberships when staff has user_id and is active; skips placeholders.';
