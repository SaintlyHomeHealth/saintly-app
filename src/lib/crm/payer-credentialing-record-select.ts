/** Shared Supabase select lists for payer credentialing (keep in sync with table columns). */

export const PAYER_RECORD_SELECT_FULL =
  "id, payer_name, payer_type, market_state, credentialing_status, contracting_status, portal_url, portal_username_hint, primary_contact_name, primary_contact_phone, primary_contact_phone_direct, primary_contact_fax, primary_contact_email, primary_contact_title, primary_contact_department, primary_contact_website, primary_contact_notes, primary_contact_last_contacted_at, primary_contact_preferred_method, primary_contact_status, notes, last_follow_up_at, assigned_owner_user_id, next_action, next_action_due_date, priority, denial_reason";

export const PAYER_CREDENTIALING_RECORD_DETAIL_SELECT = `${PAYER_RECORD_SELECT_FULL}, created_at, updated_at`;
