-- Support call-context poller: `.order('started_at', { ascending: false }).limit(1)` after OR filters.
-- `external_call_id` is already unique-indexed; this helps recent-row resolution under load.

create index if not exists phone_calls_started_at_desc_idx
  on public.phone_calls (started_at desc nulls last);

comment on index public.phone_calls_started_at_desc_idx is
  'Speeds latest phone_calls row selection for workspace call-context and similar polls.';
