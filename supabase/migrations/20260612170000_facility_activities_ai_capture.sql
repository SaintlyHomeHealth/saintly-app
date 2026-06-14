-- AI Capture metadata on facility activities.

alter table public.facility_activities
  add column if not exists ai_summary text,
  add column if not exists ai_extracted_json jsonb;

comment on column public.facility_activities.ai_summary is 'Short AI-generated summary of captured field note';
comment on column public.facility_activities.ai_extracted_json is 'Structured JSON extracted by AI Capture before user confirmation';
