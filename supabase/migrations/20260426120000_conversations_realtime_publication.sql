-- Inbox list ordering / preview: react to last_message_at updates via Realtime.
alter publication supabase_realtime add table public.conversations;
