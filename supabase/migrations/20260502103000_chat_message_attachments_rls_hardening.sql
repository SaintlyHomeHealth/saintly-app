-- Harden chat_message_attachments SELECT RLS for client/realtime (API uses service role + membership).
-- Uses coalesce(is_active, true) so legacy rows still match the admin branch when is_active is null.

drop policy if exists "chat_message_attachments_select" on public.chat_message_attachments;

create policy "chat_message_attachments_select"
  on public.chat_message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.internal_chat_members m
      where m.chat_id = chat_message_attachments.chat_thread_id
        and m.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and coalesce(sp.is_active, true) = true
        and sp.role in ('super_admin', 'admin')
    )
  );
