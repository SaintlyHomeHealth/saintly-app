-- voice/register (and any PostgREST upsert) uses ON CONFLICT (user_id, fcm_token) with no predicate.
-- PostgreSQL only accepts that for a non-partial unique index/constraint.
-- The previous partial index (WHERE fcm_token IS NOT NULL) caused:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- A full unique index on (user_id, fcm_token) still allows multiple NULL fcm_token rows per user
-- (NULLs are distinct for uniqueness).

drop index if exists public.devices_user_fcm_unique;

create unique index devices_user_fcm_unique
  on public.devices (user_id, fcm_token);
