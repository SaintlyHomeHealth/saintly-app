-- Speed ORDER BY updated_at DESC on workspace + admin call logs (hot path).
-- Partial indexes on phone_calls reference updated_at but do not substitute for
-- a plain btree when listing all statuses / filters.

create index if not exists phone_calls_updated_at_desc_list_idx
  on public.phone_calls (updated_at desc nulls last);

comment on index public.phone_calls_updated_at_desc_list_idx is
  'Call log lists (/workspace/phone/calls, /admin/phone) order by updated_at desc.';
