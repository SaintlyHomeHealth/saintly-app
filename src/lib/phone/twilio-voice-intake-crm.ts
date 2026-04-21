import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { supabaseAdmin } from "@/lib/admin";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import type { VoiceAiStoredPayload } from "@/lib/phone/voice-ai-background";

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function leadStatusIsActive(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s) return true;
  return s !== "converted" && s !== "dead_lead";
}

function crmTypeFromPayload(payload: VoiceAiStoredPayload): string {
  const t = payload.crm_suggestion.type.trim().toLowerCase();
  if (t === "patient" || t === "referral" || t === "caregiver" || t === "spam") {
    return t;
  }
  const cat = payload.caller_category.trim().toLowerCase();
  if (cat === "patient_family") return "patient";
  if (cat === "referral_provider") return "referral";
  if (cat === "caregiver_applicant") return "caregiver";
  if (cat === "spam") return "spam";
  return "";
}

export function isSpamVoicePayload(payload: VoiceAiStoredPayload): boolean {
  return (
    payload.caller_category.trim().toLowerCase() === "spam" ||
    payload.crm_suggestion.type.trim().toLowerCase() === "spam"
  );
}

/**
 * Tags spam on the call row for filtering (primary_tag + metadata.crm) — service role, Twilio-safe.
 */
export async function markPhoneCallAsSpam(phoneCallId: string): Promise<void> {
  const id = phoneCallId.trim();
  if (!id) return;

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata, primary_tag")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) {
    console.warn("[twilio-voice-intake-crm] markPhoneCallAsSpam load:", loadErr?.message);
    return;
  }

  const existingMeta = asMetadata(row.metadata);
  const prevCrm =
    existingMeta.crm && typeof existingMeta.crm === "object" && !Array.isArray(existingMeta.crm)
      ? (existingMeta.crm as Record<string, unknown>)
      : {};

  const prevTags = typeof prevCrm.tags === "string" ? prevCrm.tags.trim() : "";
  const tagParts = [prevTags, "spam", "voice_ai"].filter(Boolean);
  const nextCrm: Record<string, unknown> = {
    ...prevCrm,
    type: "spam",
    outcome: typeof prevCrm.outcome === "string" && prevCrm.outcome.trim() ? prevCrm.outcome : "wrong_number",
    tags: tagParts.join(",").slice(0, 500),
    note: typeof prevCrm.note === "string" && prevCrm.note.trim() ? prevCrm.note : "Flagged as spam by voice AI.",
  };

  const { error: upErr } = await supabaseAdmin
    .from("phone_calls")
    .update({
      primary_tag: "spam",
      metadata: {
        ...existingMeta,
        crm: nextCrm,
      },
    })
    .eq("id", id);

  if (upErr) {
    console.warn("[twilio-voice-intake-crm] markPhoneCallAsSpam update:", upErr.message);
  }
}

/**
 * Merges AI CRM hints into metadata.crm when staff has not set type yet (non-destructive).
 */
export async function mergeVoiceAiHintsIntoPhoneCallCrm(
  phoneCallId: string,
  payload: VoiceAiStoredPayload
): Promise<void> {
  const id = phoneCallId.trim();
  if (!id || isSpamVoicePayload(payload)) return;

  const suggestedType = crmTypeFromPayload(payload);
  if (!suggestedType || suggestedType === "spam") return;

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row) {
    console.warn("[twilio-voice-intake-crm] mergeVoiceAiHints load:", loadErr?.message);
    return;
  }

  const existingMeta = asMetadata(row.metadata);
  const prevCrm =
    existingMeta.crm && typeof existingMeta.crm === "object" && !Array.isArray(existingMeta.crm)
      ? (existingMeta.crm as Record<string, unknown>)
      : {};

  const prevType = typeof prevCrm.type === "string" ? prevCrm.type.trim() : "";
  if (prevType !== "") {
    return;
  }

  const crm = payload.crm_suggestion;
  const nextCrm: Record<string, unknown> = {
    ...prevCrm,
    type: suggestedType,
    outcome: crm.outcome?.trim() || "needs_followup",
    tags: crm.tags?.trim().slice(0, 500) || "",
    note: crm.note?.trim().slice(0, 2000) || "",
  };

  const { error: upErr } = await supabaseAdmin
    .from("phone_calls")
    .update({
      metadata: {
        ...existingMeta,
        crm: nextCrm,
      },
    })
    .eq("id", id);

  if (upErr) {
    console.warn("[twilio-voice-intake-crm] mergeVoiceAiHints update:", upErr.message);
  }
}

/** Service-role: link or create CRM contact from call party number (Twilio-safe). */
export async function ensureContactLinkedToCall(phoneCallId: string): Promise<string | null> {
  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, from_e164, to_e164, direction, contact_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (callErr || !callRow?.id) {
    console.warn("[twilio-voice-intake-crm] ensureContact load:", callErr?.message);
    return null;
  }

  const existing =
    callRow.contact_id != null && String(callRow.contact_id).trim() !== ""
      ? String(callRow.contact_id)
      : null;
  if (existing) {
    return existing;
  }

  const dir = String(callRow.direction ?? "").trim().toLowerCase();
  const rawFrom = typeof callRow.from_e164 === "string" ? callRow.from_e164.trim() : "";
  const rawTo = typeof callRow.to_e164 === "string" ? callRow.to_e164.trim() : "";
  const partyE164 = dir === "outbound" ? rawTo || rawFrom : rawFrom || rawTo;
  if (!partyE164) {
    return null;
  }

  const found = await findContactByIncomingPhone(supabaseAdmin, partyE164);
  let contactId: string;

  if (found?.id) {
    contactId = found.id;
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert({ full_name: partyE164, primary_phone: partyE164 })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      console.warn("[twilio-voice-intake-crm] contact insert:", insErr?.message);
      return null;
    }
    contactId = String(inserted.id);
  }

  const { error: linkErr } = await supabaseAdmin
    .from("phone_calls")
    .update({ contact_id: contactId })
    .eq("id", phoneCallId)
    .is("contact_id", null);

  if (linkErr) {
    console.warn("[twilio-voice-intake-crm] link contact:", linkErr.message);
  }

  return contactId;
}

/** Service-role: ensure an active lead for contact when not already a patient. */
export async function ensureActiveLeadForContact(contactId: string): Promise<void> {
  const { data: patientRow } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (patientRow?.id) {
    return;
  }

  const { data: leadRows, error: leadsErr } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id, status").eq("contact_id", contactId)
  );

  if (leadsErr) {
    console.warn("[twilio-voice-intake-crm] list leads:", leadsErr.message);
    return;
  }

  if ((leadRows ?? []).some((L) => leadStatusIsActive(L.status))) {
    return;
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("leads")
    .insert({ contact_id: contactId, source: "phone", status: "new" })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.warn("[twilio-voice-intake-crm] insert lead:", insErr?.message);
    return;
  }

  await handleNewLeadCreated(supabaseAdmin, {
    leadId: String(inserted.id),
    contactId,
    intakeChannel: "voice_intake",
  });
}

/**
 * After live AI classification: CRM hints + contact + lead for real intake callers (not spam/vendor-only).
 */
/** True when the live model says we should bridge to browser/PSTN (not noop / not spam). */
export function shouldTransferToHumanAfterLiveAi(payload: VoiceAiStoredPayload | null): boolean {
  if (!payload) {
    return false;
  }
  if (process.env.TWILIO_AI_RECEPTIONIST_ALWAYS_DIAL_TO_HUMAN?.trim() === "true") {
    return true;
  }
  if (isSpamVoicePayload(payload)) {
    return false;
  }
  return (
    payload.urgency === "critical" ||
    payload.route_target === "intake_queue" ||
    payload.route_target === "referral_team" ||
    payload.route_target === "hiring_queue" ||
    payload.route_target === "procurement" ||
    payload.route_target === "security"
  );
}

export async function applyVoiceIntakeCrmAfterLiveAi(
  phoneCallId: string,
  payload: VoiceAiStoredPayload
): Promise<void> {
  if (isSpamVoicePayload(payload)) {
    await markPhoneCallAsSpam(phoneCallId);
    return;
  }

  await mergeVoiceAiHintsIntoPhoneCallCrm(phoneCallId, payload);

  const cat = payload.caller_category.trim().toLowerCase();
  if (cat === "vendor_other") {
    return;
  }

  const type = crmTypeFromPayload(payload);
  if (type !== "patient" && type !== "referral" && type !== "caregiver") {
    return;
  }

  const contactId = await ensureContactLinkedToCall(phoneCallId);
  if (!contactId) {
    return;
  }

  await ensureActiveLeadForContact(contactId);
}
