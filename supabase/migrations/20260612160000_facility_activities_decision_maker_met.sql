-- Quick Log: decision maker met flag on facility activities.

alter table public.facility_activities
  add column if not exists decision_maker_met boolean not null default false;

comment on column public.facility_activities.decision_maker_met is 'Field rep marked that they met a decision maker during this activity';
