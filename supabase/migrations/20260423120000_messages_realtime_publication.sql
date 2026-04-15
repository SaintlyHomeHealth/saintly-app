-- Workspace / admin SMS threads: live updates via postgres_changes on public.messages.
alter publication supabase_realtime add table public.messages;
