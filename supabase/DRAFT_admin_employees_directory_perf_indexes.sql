-- DRAFT / SAFE REVIEW — not in `migrations/` so it is not applied automatically.
-- Purpose: optional indexes to speed admin employee directory batched queries
-- (`loadEmployeeDirectoryRows` uses `.in("applicant_id", ...)` / `.in("employee_id", ...)`).
--
-- Verify with EXPLAIN ANALYZE on representative workloads before promoting to a real migration.
-- Uncomment statements after confirming no duplicate indexes exist in your environment.
-- Prefer CREATE INDEX CONCURRENTLY in production to avoid long locks.

-- applicants: directory ordered by recency
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applicants_updated_created_desc
--   ON public.applicants (updated_at DESC NULLS LAST, created_at DESC NULLS LAST);

-- admin_compliance_events: events per applicant (event_type filtered)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_compliance_events_applicant_event_type
--   ON public.admin_compliance_events (applicant_id, event_type);

-- employee_admin_forms: forms per employee + type
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_admin_forms_employee_form_type
--   ON public.employee_admin_forms (employee_id, form_type);

-- employee_credentials: credentials per employee
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_credentials_employee_id
--   ON public.employee_credentials (employee_id);

-- applicant_files: uploads per applicant
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applicant_files_applicant_id
--   ON public.applicant_files (applicant_id);

-- documents: legacy uploads per applicant
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_applicant_id
--   ON public.documents (applicant_id);

-- employee_training_attempts / employee_training_completions
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_training_attempts_applicant_id
--   ON public.employee_training_attempts (applicant_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_training_completions_applicant_id
--   ON public.employee_training_completions (applicant_id);

-- employee_credential_reminder_sends: reminder summary by applicant
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credential_reminder_sends_applicant_created
--   ON public.employee_credential_reminder_sends (applicant_id, created_at DESC);
