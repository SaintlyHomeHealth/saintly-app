/**
 * Shared `phone_calls` column list for admin + workspace call logs.
 * Keep in sync with `mapPhoneCallQueryRowForLog` in `app/admin/phone/call-log-display.ts`.
 *
 * **Workspace** routes must use {@link PHONE_CALL_LOG_LIST_SELECT_BASE} only: `contacts` RLS is
 * limited to manager/admin/super_admin, so embedding `contacts(...)` makes PostgREST return zero
 * rows (or errors) for nurses and other roles even when `phone_calls` RLS allows the row.
 */
export const PHONE_CALL_LOG_LIST_SELECT_BASE =
  "id, created_at, updated_at, external_call_id, direction, from_e164, to_e164, status, started_at, ended_at, duration_seconds, voicemail_recording_sid, voicemail_duration_seconds, priority_sms_sent_at, priority_sms_reason, auto_reply_sms_sent_at, auto_reply_sms_body, assigned_to_user_id, assigned_at, assigned_to_label, primary_tag, contact_id, metadata, workspace_missed_followup_resolved_at";

export const PHONE_CALL_LOG_LIST_SELECT = `${PHONE_CALL_LOG_LIST_SELECT_BASE}, contacts ( full_name, first_name, last_name, organization_name )`;
