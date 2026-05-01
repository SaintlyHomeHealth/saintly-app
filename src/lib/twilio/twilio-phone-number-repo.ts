import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeDialInputToE164, isValidE164 } from "@/lib/softphone/phone-number";

export type TwilioPhoneNumberRow = {
  id: string;
  phone_number: string;
  twilio_sid: string;
  label: string | null;
  number_type: string;
  status: string;
  assigned_user_id: string | null;
  assigned_staff_profile_id: string | null;
  is_primary_company_number: boolean;
  /** Saintly backup shared line (+14805712062); at most one row may be true. */
  is_company_backup_number: boolean;
  sms_enabled: boolean;
  voice_enabled: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * When PSTN hits a staff-assigned voice-enabled number, ring this user first in Voice.js.
 */
export async function resolveInboundVoiceStaffAssigneeUserId (
  supabase: SupabaseClient,
  toRaw: string
): Promise<string | null> {
  const row = await findTwilioPhoneNumberByToE164(supabase, toRaw);
  if (!row?.id) return null;
  if (row.status !== "assigned" || row.voice_enabled === false) return null;
  const uid = typeof row.assigned_user_id === "string" ? row.assigned_user_id.trim() : "";
  return uid || null;
}

function coerceTwilioPhoneNumberRow(data: unknown): TwilioPhoneNumberRow {
  const r = data as TwilioPhoneNumberRow;
  return {
    ...r,
    is_company_backup_number: Boolean(r.is_company_backup_number),
  };
}

export async function findTwilioPhoneNumberByToE164 (
  supabase: SupabaseClient,
  toRaw: string
): Promise<TwilioPhoneNumberRow | null> {
  const n = normalizeDialInputToE164(toRaw.trim());
  if (!n || !isValidE164(n)) return null;

  const { data, error } = await supabase
    .from("twilio_phone_numbers")
    .select(
      "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, is_company_backup_number, sms_enabled, voice_enabled, created_at, updated_at"
    )
    .eq("phone_number", n)
    .maybeSingle();

  if (error) {
    console.warn("[twilio-phone-numbers] findByTo:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return coerceTwilioPhoneNumberRow(data);
}

export async function loadAssignedTwilioNumberForUser (
  supabase: SupabaseClient,
  userId: string
): Promise<TwilioPhoneNumberRow | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("twilio_phone_numbers")
    .select(
      "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, is_company_backup_number, sms_enabled, voice_enabled, created_at, updated_at"
    )
    .eq("assigned_user_id", uid)
    .eq("status", "assigned")
    .maybeSingle();

  if (error) {
    console.warn("[twilio-phone-numbers] loadAssignedForUser:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return coerceTwilioPhoneNumberRow(data);
}

export async function logTwilioNumberAssignment (
  supabase: SupabaseClient,
  input: {
    phoneNumberId: string;
    assignedFromUserId: string | null;
    assignedToUserId: string | null;
    assignedByUserId: string | null;
    reason: string | null;
  }
): Promise<void> {
  await supabase.from("twilio_phone_number_assignments").insert({
    phone_number_id: input.phoneNumberId,
    assigned_from_user_id: input.assignedFromUserId,
    assigned_to_user_id: input.assignedToUserId,
    assigned_by_user_id: input.assignedByUserId,
    reason: input.reason,
  });
}

const ASSIGN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Assign an inventory row to a staff auth user (Admin Phone Numbers / Staff Access).
 * Optionally mirrors E.164 onto staff_profiles.dedicated_outbound_e164 for legacy env allowlists.
 */
export async function assignTwilioPhoneNumberToStaffUser (
  supabase: SupabaseClient,
  input: {
    phoneNumberId: string;
    assignToUserId: string;
    assignedByUserId: string | null;
    reason?: string | null;
    syncDedicatedOutboundE164?: boolean;
  }
): Promise<{ ok: true; phone_number: string } | { ok: false; error: string; status: number }> {
  const phoneNumberId = input.phoneNumberId.trim();
  const assignToUserId = input.assignToUserId.trim();
  if (!ASSIGN_UUID_RE.test(phoneNumberId) || !ASSIGN_UUID_RE.test(assignToUserId)) {
    return { ok: false, error: "Invalid phoneNumberId or assignToUserId.", status: 400 };
  }

  const { data: row, error: loadErr } = await supabase
    .from("twilio_phone_numbers")
    .select(
      "id, phone_number, status, assigned_user_id, assigned_staff_profile_id, number_type, is_primary_company_number, is_company_backup_number"
    )
    .eq("id", phoneNumberId)
    .maybeSingle();

  if (loadErr || !row?.id) {
    return { ok: false, error: "Number not found.", status: 404 };
  }
  const nt = typeof row.number_type === "string" ? row.number_type.trim() : "staff_direct";
  const isCompanySharedRow =
    row.is_primary_company_number === true ||
    row.is_company_backup_number === true ||
    nt === "company_shared";
  if (isCompanySharedRow) {
    return {
      ok: false,
      error: "Company/shared Twilio lines cannot be assigned as a dedicated staff number.",
      status: 400,
    };
  }
  if (row.status === "retired") {
    return { ok: false, error: "Cannot assign a retired number.", status: 400 };
  }
  if (row.status === "assigned" && row.assigned_user_id && String(row.assigned_user_id) !== assignToUserId) {
    return { ok: false, error: "Number is already assigned. Use reassign or unassign first.", status: 409 };
  }

  const { data: profile, error: profErr } = await supabase
    .from("staff_profiles")
    .select("id, user_id, role, is_active")
    .eq("user_id", assignToUserId)
    .maybeSingle();

  if (profErr || !profile?.id || !profile.user_id) {
    return { ok: false, error: "Staff profile not found for that user.", status: 400 };
  }
  if (profile.is_active === false) {
    return { ok: false, error: "Cannot assign to inactive staff.", status: 400 };
  }
  if (profile.role === "read_only") {
    return { ok: false, error: "Cannot assign numbers to read-only users.", status: 400 };
  }

  if (
    row.status === "assigned" &&
    row.assigned_user_id &&
    String(row.assigned_user_id).trim() === assignToUserId
  ) {
    const pn = typeof row.phone_number === "string" ? row.phone_number.trim() : "";
    return { ok: true, phone_number: pn };
  }

  const { data: other } = await supabase
    .from("twilio_phone_numbers")
    .select("id")
    .eq("assigned_user_id", assignToUserId)
    .eq("status", "assigned")
    .neq("id", phoneNumberId)
    .maybeSingle();

  if (other?.id) {
    return {
      ok: false,
      error: "That staff member already has an assigned Twilio number. Unassign it first.",
      status: 409,
    };
  }

  const prevUser =
    row.assigned_user_id != null && String(row.assigned_user_id).trim() !== ""
      ? String(row.assigned_user_id).trim()
      : null;

  await logTwilioNumberAssignment(supabase, {
    phoneNumberId,
    assignedFromUserId: prevUser,
    assignedToUserId: assignToUserId,
    assignedByUserId: input.assignedByUserId,
    reason: input.reason ?? "assign",
  });

  const { error: upErr } = await supabase
    .from("twilio_phone_numbers")
    .update({
      assigned_user_id: assignToUserId,
      assigned_staff_profile_id: profile.id,
      status: "assigned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", phoneNumberId);

  if (upErr) {
    console.warn("[twilio-phone-numbers] assign update:", upErr.message);
    return { ok: false, error: upErr.message, status: 500 };
  }

  const phone_number =
    typeof row.phone_number === "string" && row.phone_number.trim() ? row.phone_number.trim() : "";

  if (input.syncDedicatedOutboundE164 && phone_number) {
    await supabase
      .from("staff_profiles")
      .update({
        dedicated_outbound_e164: phone_number,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", assignToUserId);
  }

  return { ok: true, phone_number };
}

export async function releaseTwilioNumbersForStaffUser (
  supabase: SupabaseClient,
  input: {
    staffUserId: string;
    staffProfileId: string;
    releasedByUserId: string | null;
    reason: string;
  }
): Promise<number> {
  const uid = input.staffUserId.trim();
  if (!uid) return 0;

  const { data: rows, error: selErr } = await supabase
    .from("twilio_phone_numbers")
    .select("id, assigned_user_id, assigned_staff_profile_id")
    .eq("assigned_user_id", uid)
    .eq("status", "assigned");

  if (selErr) {
    console.warn("[twilio-phone-numbers] release select:", selErr.message);
    return 0;
  }

  let count = 0;
  for (const r of rows ?? []) {
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) continue;

    await logTwilioNumberAssignment(supabase, {
      phoneNumberId: id,
      assignedFromUserId: uid,
      assignedToUserId: null,
      assignedByUserId: input.releasedByUserId,
      reason: input.reason,
    });

    const { error: upErr } = await supabase
      .from("twilio_phone_numbers")
      .update({
        assigned_user_id: null,
        assigned_staff_profile_id: null,
        status: "available",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (upErr) {
      console.warn("[twilio-phone-numbers] release update:", upErr.message);
      continue;
    }
    count += 1;
  }

  return count;
}
