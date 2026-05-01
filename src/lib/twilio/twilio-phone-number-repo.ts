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

export async function findTwilioPhoneNumberByToE164 (
  supabase: SupabaseClient,
  toRaw: string
): Promise<TwilioPhoneNumberRow | null> {
  const n = normalizeDialInputToE164(toRaw.trim());
  if (!n || !isValidE164(n)) return null;

  const { data, error } = await supabase
    .from("twilio_phone_numbers")
    .select(
      "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, sms_enabled, voice_enabled, created_at, updated_at"
    )
    .eq("phone_number", n)
    .maybeSingle();

  if (error) {
    console.warn("[twilio-phone-numbers] findByTo:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return data as TwilioPhoneNumberRow;
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
      "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, sms_enabled, voice_enabled, created_at, updated_at"
    )
    .eq("assigned_user_id", uid)
    .eq("status", "assigned")
    .maybeSingle();

  if (error) {
    console.warn("[twilio-phone-numbers] loadAssignedForUser:", error.message);
    return null;
  }
  if (!data?.id) return null;
  return data as TwilioPhoneNumberRow;
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
