-- Broadcast phone_calls changes to admin clients (Recent Calls live table).
alter publication supabase_realtime add table public.phone_calls;
