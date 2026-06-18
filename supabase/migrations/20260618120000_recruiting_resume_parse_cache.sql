-- Cache resume text extraction + parse metadata on upload (avoid re-OCR on page load).

alter table public.recruiting_candidates
  add column if not exists resume_extracted_raw_text text,
  add column if not exists resume_extracted_clean_text text,
  add column if not exists resume_extraction_method text,
  add column if not exists resume_parse_quality text,
  add column if not exists resume_parse_warnings text,
  add column if not exists resume_parse_notes text;

comment on column public.recruiting_candidates.resume_extracted_raw_text is
  'Raw text from PDF/DOC extract and/or OCR at last upload/re-parse (truncated in app).';
comment on column public.recruiting_candidates.resume_extracted_clean_text is
  'Normalized text used for heuristics at last upload/re-parse.';
comment on column public.recruiting_candidates.resume_extraction_method is
  'How text was obtained: pdf_text, ocr, hybrid, or manual.';
comment on column public.recruiting_candidates.resume_parse_quality is
  'Parse outcome quality label from resume-extract-pipeline.';
comment on column public.recruiting_candidates.resume_parse_warnings is
  'Newline-separated recruiter-facing parse warnings.';
comment on column public.recruiting_candidates.resume_parse_notes is
  'Newline-separated parse notes (e.g. discipline detection rationale).';
