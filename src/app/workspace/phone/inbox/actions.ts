"use server";

import { revalidatePath } from "next/cache";

import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { mergeTelemetryOnSend } from "@/lib/phone/sms-suggestion-telemetry";
import { softDeleteSmsConversation, softDeleteSmsMessage } from "@/lib/phone/sms-soft-delete";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import {
  LEAD_INSURANCE_BUCKET,
  LEAD_INSURANCE_MAX_BYTES,
  isAllowedLeadInsuranceMime,
  sanitizeLeadInsuranceFileName,
} from "@/lib/crm/lead-insurance-storage";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { PHONE_MESSAGE_MEDIA_BUCKET } from "@/lib/phone/phone-message-media-bucket";
import { staffMayAccessSmsConversation } from "@/lib/phone/staff-sms-conversation-access-async";
import { buildInitialTwilioDeliveryFromRestResponse } from "@/lib/phone/sms-delivery-ui";
import { ensureSmsConversationForPhone } from "@/lib/phone/sms-conversation-thread";
import { resolveContactAndPhoneForWorkspaceNewSms } from "@/lib/phone/workspace-new-sms-resolve";
import {
  allowlistedOutboundE164OrUndefined,
  resolveManualInboxSmsFromOverride,
} from "@/lib/twilio/manual-inbox-sms-from";
import { logSmsDebug } from "@/lib/twilio/sms-debug";
import { sendSms } from "@/lib/twilio/send-sms";
import {
  isSaintlyBackupSmsE164,
  resolveDefaultTwilioSmsFromOrMsid,
  SMS_OUTBOUND_FROM_EXPLICIT_KEY,
  shouldHonorThreadPreferredFromE164,
} from "@/lib/twilio/sms-from-numbers";
import { resolveWorkspaceThreadOutboundSmsIdentity } from "@/lib/twilio/workspace-outbound-sms-identity";
import {
  staffMayAccessWorkspaceSms,
  staffMayAccessWorkspaceVoicemail,
} from "@/lib/phone/staff-phone-policy";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SMS_BODY_MAX = 1600;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WorkspaceSmsActionResult = { ok: true } | { ok: false; error: string };

function revalidateSmsViews(conversationId: string) {
  revalidatePath("/admin/phone/messages");
  revalidatePath(`/admin/phone/messages/${conversationId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/workspace/phone/inbox/new");
  revalidatePath(`/workspace/phone/inbox/${conversationId}`);
}

/**
 * Soft-delete one inbound/outbound message (service role + staff access check).
 */
export async function deleteWorkspaceSmsMessage(
  conversationId: string,
  messageId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const result = await softDeleteSmsMessage(supabaseAdmin, staff, { conversationId, messageId });
  if (result.ok) {
    revalidateSmsViews(conversationId);
    revalidatePath("/workspace/phone/voicemail");
  }
  return result;
}

/**
 * Soft-delete the whole SMS thread for this inbox (conversation + all messages).
 */
export async function deleteWorkspaceSmsConversation(
  conversationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const result = await softDeleteSmsConversation(supabaseAdmin, staff, { conversationId });
  if (result.ok) {
    revalidateSmsViews(conversationId);
  }
  return result;
}

/**
 * Voicemail tab list: soft-delete the thread voicemail message when present, else flag `phone_calls.metadata`.
 * Reuses `softDeleteSmsMessage` so behavior matches thread delete + 30-day cleanup.
 */
export async function softDeleteWorkspaceVoicemailListItem(
  phoneCallId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceVoicemail(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const id = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, error: "invalid_id" };
  }

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id, owner_user_id, metadata")
    .eq("id", id)
    .maybeSingle();

  if (callErr || !callRow?.id) {
    return { ok: false, error: "not_found" };
  }

  const assignedTo =
    callRow.assigned_to_user_id != null && String(callRow.assigned_to_user_id).trim() !== ""
      ? String(callRow.assigned_to_user_id)
      : null;

  const ownerUid =
    callRow.owner_user_id != null && String(callRow.owner_user_id).trim() !== ""
      ? String(callRow.owner_user_id)
      : null;

  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: assignedTo,
      owner_user_id: ownerUid,
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const { data: vmMsg, error: msgErr } = await supabaseAdmin
    .from("messages")
    .select("id, conversation_id, deleted_at")
    .eq("phone_call_id", id)
    .eq("message_type", "voicemail")
    .maybeSingle();

  if (msgErr) {
    console.warn("[voicemail-list-delete] message load:", msgErr.message);
    return { ok: false, error: "load_failed" };
  }

  const msgDeleted =
    vmMsg?.deleted_at != null && typeof vmMsg.deleted_at === "string" && vmMsg.deleted_at.trim() !== "";

  if (msgDeleted) {
    return { ok: true };
  }

  if (vmMsg?.id) {
    const conversationId = String(vmMsg.conversation_id);
    const messageId = String(vmMsg.id);
    const result = await softDeleteSmsMessage(supabaseAdmin, staff, { conversationId, messageId });
    if (!result.ok) {
      return result;
    }
    revalidateSmsViews(conversationId);
  } else {
    const prev =
      callRow.metadata != null && typeof callRow.metadata === "object" && !Array.isArray(callRow.metadata)
        ? { ...(callRow.metadata as Record<string, unknown>) }
        : {};
    if (typeof prev.voicemail_inbox_soft_deleted_at === "string" && prev.voicemail_inbox_soft_deleted_at.trim()) {
      revalidatePath("/workspace/phone/voicemail");
      return { ok: true };
    }
    prev.voicemail_inbox_soft_deleted_at = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin.from("phone_calls").update({ metadata: prev }).eq("id", id);
    if (upErr) {
      console.warn("[voicemail-list-delete] metadata flag:", upErr.message);
      return { ok: false, error: "update_failed" };
    }
  }

  revalidatePath("/workspace/phone/voicemail");
  return { ok: true };
}

export type SmsComposeSearchRow = {
  id: string;
  label: string;
  /** Display phone */
  phone: string | null;
  kind: "contact" | "recruit";
};

/**
 * Typeahead for compose "To" field — CRM contacts + recruiting candidates (manager/don flows).
 */
export async function searchWorkspaceSmsComposeTargets(query: string): Promise<{
  contacts: SmsComposeSearchRow[];
  recruits: SmsComposeSearchRow[];
}> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    return { contacts: [], recruits: [] };
  }

  const q = typeof query === "string" ? query.trim() : "";
  if (q.length < 2) {
    return { contacts: [], recruits: [] };
  }

  const safe = q.replace(/[%_,()]/g, "").slice(0, 64);
  if (!safe) {
    return { contacts: [], recruits: [] };
  }

  const pattern = `%${safe}%`;

  const [cName, cPhone, rName, rPhone] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone")
      .is("archived_at", null)
      .ilike("full_name", pattern)
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(8),
    supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone")
      .is("archived_at", null)
      .ilike("primary_phone", pattern)
      .limit(8),
    supabaseAdmin
      .from("recruiting_candidates")
      .select("id, full_name, phone")
      .ilike("full_name", pattern)
      .order("full_name", { ascending: true })
      .limit(8),
    supabaseAdmin
      .from("recruiting_candidates")
      .select("id, full_name, phone")
      .ilike("phone", pattern)
      .limit(8),
  ]);

  const contactRows = mergeUniqueById([...(cName.data ?? []), ...(cPhone.data ?? [])]);

  const contacts: SmsComposeSearchRow[] = contactRows.map((row) => {
    const fn =
      typeof row.full_name === "string" && row.full_name.trim()
        ? row.full_name.trim()
        : [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Contact";
    return {
      id: String(row.id),
      label: fn,
      phone: typeof row.primary_phone === "string" ? row.primary_phone : null,
      kind: "contact" as const,
    };
  });

  const recruitRows = mergeUniqueById([...(rName.data ?? []), ...(rPhone.data ?? [])]);

  const recruits: SmsComposeSearchRow[] = recruitRows.map((row) => ({
    id: String(row.id),
    label: typeof row.full_name === "string" ? row.full_name.trim() || "Recruit" : "Recruit",
    phone: typeof row.phone === "string" ? row.phone : null,
    kind: "recruit" as const,
  }));

  return { contacts, recruits };
}

function mergeUniqueById<T extends { id: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = row.id != null ? String(row.id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Start (or reuse) an SMS thread, send Twilio outbound, persist `messages`, then open the thread.
 */
export async function sendWorkspaceNewSms(formData: FormData): Promise<WorkspaceSmsActionResult> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    return { ok: false, error: "You do not have access to send messages." };
  }

  const bodyRaw = formData.get("body");
  const body = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, SMS_BODY_MAX) : "";
  const phoneRaw = typeof formData.get("phone") === "string" ? formData.get("phone")!.toString() : "";
  const contactIdRaw = formData.get("contactId");
  const recruitIdRaw = formData.get("recruitingCandidateId");
  const contactId = typeof contactIdRaw === "string" ? contactIdRaw.trim() : "";
  const recruitingCandidateId = typeof recruitIdRaw === "string" ? recruitIdRaw.trim() : "";

  if (!body) {
    return { ok: false, error: "Enter a message and try again." };
  }

  const resolved = await resolveContactAndPhoneForWorkspaceNewSms({
    phoneRaw,
    contactId: contactId || null,
    recruitingCandidateId: recruitingCandidateId || null,
  });

  if (!resolved.ok) {
    return { ok: false, error: mapResolveError(resolved.error) };
  }

  const { e164, contact } = resolved;

  /**
   * Same as inbound SMS (`applyInboundTwilioSms`): `ensureSmsConversationForPhone` always persists a
   * normalized `lead_status` (defaults to `new`). See `normalizeConversationLeadStatusForInsert`.
   */
  const ensured = await ensureSmsConversationForPhone(supabaseAdmin, e164, contact);

  if (!ensured.ok) {
    console.error("[workspace-new-sms] step=ensure_thread FAILED (before Twilio)", {
      ensureError: ensured.error,
      e164,
    });
    return {
      ok: false,
      error: ensured.error ? `Could not create SMS thread: ${ensured.error.slice(0, 500)}` : "Could not create SMS thread.",
    };
  }

  const conversationId = ensured.conversationId;

  const { data: convPrefRow } = await supabaseAdmin
    .from("conversations")
    .select("preferred_from_e164, metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const manualFromRaw = String(formData.get("smsManualFromE164") ?? "").trim();
  logSmsDebug("[sms-send] backend_received_from", {
    smsManualFromE164: manualFromRaw || null,
    path: "workspace_new_sms",
  });
  const manualResolved = resolveManualInboxSmsFromOverride(manualFromRaw);
  if (manualFromRaw && manualResolved.source !== "explicit") {
    logSmsDebug("[sms-send] manual_from_rejected", {
      smsManualFromE164: manualFromRaw,
      reason: manualResolved.source,
    });
  }

  const pref = allowlistedOutboundE164OrUndefined(
    typeof convPrefRow?.preferred_from_e164 === "string" ? convPrefRow.preferred_from_e164 : ""
  );
  const honorThreadPreferred = Boolean(
    pref && shouldHonorThreadPreferredFromE164(pref, convPrefRow?.metadata ?? {})
  );

  const identity = await resolveWorkspaceThreadOutboundSmsIdentity(supabaseAdmin, staff, {
    manualResolved,
    threadPreferredE164: pref,
    honorThreadPreferred,
  });
  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  const persistPreferredE164 =
    manualResolved.source === "explicit"
      ? manualResolved.fromOverride
      : honorThreadPreferred && pref
        ? pref
        : undefined;

  const sent = await sendSms({
    to: e164,
    body,
    ...(identity.fromOverride ? { fromOverride: identity.fromOverride } : {}),
    logManualInboxSend: true,
  });

  if (!sent.ok) {
    console.error("[workspace-new-sms] step=twilio_send FAILED (after conversation row)", {
      conversationId,
      error: sent.error,
    });
    const errShort = sent.error.slice(0, 600);
    return {
      ok: false,
      error: errShort ? `SMS could not be sent: ${errShort}` : "SMS could not be sent. Try again.",
    };
  }

  const now = new Date().toISOString();
  const resolvedFrom =
    identity.fromE164ForMessage ??
    (identity.fromOverride && !identity.fromOverride.startsWith("MG") ? identity.fromOverride : null) ??
    resolveDefaultTwilioSmsFromOrMsid();
  const fromE164ForLog = resolvedFrom.startsWith("MG") ? null : resolvedFrom;

  const { error: insErr } = await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    body,
    external_message_sid: sent.messageSid,
    owner_user_id: identity.ownerUserId,
    owner_staff_profile_id: identity.ownerStaffProfileId,
    from_number: fromE164ForLog,
    to_number: e164,
    twilio_phone_number_id: identity.twilioPhoneNumberId,
    metadata: {
      sent_by_user_id: staff.user_id,
      source: "workspace_new_sms",
      twilio_delivery: buildInitialTwilioDeliveryFromRestResponse({
        twilioStatus: sent.twilioStatus ?? null,
        updatedAtIso: now,
        fromE164: fromE164ForLog,
        toE164: e164,
      }),
    },
  });

  if (insErr) {
    console.warn("[workspace-new-sms] message insert:", insErr.message);
    return {
      ok: false,
      error: insErr.message ? `Message could not be saved: ${insErr.message.slice(0, 400)}` : "Message could not be saved.",
    };
  }

  const { data: convBefore } = await supabaseAdmin
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const meta: Record<string, unknown> =
    convBefore?.metadata != null && typeof convBefore.metadata === "object" && !Array.isArray(convBefore.metadata)
      ? { ...(convBefore.metadata as Record<string, unknown>) }
      : {};

  const { telemetry, deleteSuggestion } = mergeTelemetryOnSend(meta, body);
  const nextMeta: Record<string, unknown> = { ...meta, sms_suggestion_telemetry: telemetry };
  if (deleteSuggestion) {
    delete nextMeta.sms_reply_suggestion;
  }
  if (manualResolved.source === "explicit" && persistPreferredE164) {
    nextMeta[SMS_OUTBOUND_FROM_EXPLICIT_KEY] = isSaintlyBackupSmsE164(persistPreferredE164);
  }

  const { error: touchErr } = await supabaseAdmin
    .from("conversations")
    .update({
      last_message_at: now,
      updated_at: now,
      metadata: nextMeta,
      ...(persistPreferredE164 ? { preferred_from_e164: persistPreferredE164 } : {}),
    })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[workspace-new-sms] touch conversation:", touchErr.message);
  }

  revalidateSmsViews(conversationId);
  return { ok: true };
}

function mapResolveError(
  code: "bad_phone" | "contact_no_phone" | "recruit_no_phone" | "contact_not_found" | "contact_create_failed"
): string {
  switch (code) {
    case "bad_phone":
      return "Phone number is invalid or missing.";
    case "contact_no_phone":
      return "The selected contact does not have a phone number.";
    case "recruit_no_phone":
      return "The selected recruit does not have a phone number.";
    case "contact_not_found":
      return "The selected contact could not be found.";
    case "contact_create_failed":
      return "Could not create a contact for this number.";
    default:
      return "Could not resolve this SMS recipient.";
  }
}

export async function saveSmsMmsAttachmentToLeadInsurance(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const attachmentIdRaw = formData.get("attachmentId");
  const leadIdRaw = formData.get("leadId");
  const slotRaw = formData.get("slot");
  const attachmentId =
    typeof attachmentIdRaw === "string" ? attachmentIdRaw.trim().toLowerCase() : "";
  const leadId = typeof leadIdRaw === "string" ? leadIdRaw.trim().toLowerCase() : "";
  const slot = typeof slotRaw === "string" ? slotRaw.trim() : "";
  if (!attachmentId || !UUID_RE.test(attachmentId) || !leadId || !UUID_RE.test(leadId)) {
    return { ok: false, error: "Missing or invalid selection." };
  }
  if (slot !== "primary" && slot !== "secondary") {
    return { ok: false, error: "Choose primary or secondary insurance card." };
  }

  const supabaseUser = await createServerSupabaseClient();
  const { data: viewAtt, error: viewErr } = await supabaseUser
    .from("phone_message_attachments")
    .select("id, conversation_id")
    .eq("id", attachmentId)
    .maybeSingle();
  if (viewErr || !viewAtt?.conversation_id) {
    return { ok: false, error: "Attachment not found or not accessible." };
  }

  const convId = String(viewAtt.conversation_id);
  const { data: convSnap, error: convErr } = await supabaseAdmin
    .from("conversations")
    .select("id, primary_contact_id, assigned_to_user_id")
    .eq("id", convId)
    .maybeSingle();
  if (convErr || !convSnap?.id) {
    return { ok: false, error: "Conversation not found." };
  }
  const assignedTo =
    convSnap.assigned_to_user_id != null && String(convSnap.assigned_to_user_id).trim() !== ""
      ? String(convSnap.assigned_to_user_id).trim()
      : null;
  const may = await staffMayAccessSmsConversation(supabaseUser, staff, convId, {
    assigned_to_user_id: assignedTo,
  });
  if (!may) {
    return { ok: false, error: "You do not have access to this thread." };
  }
  const primaryContactId =
    convSnap.primary_contact_id != null && String(convSnap.primary_contact_id).trim() !== ""
      ? String(convSnap.primary_contact_id).trim()
      : null;
  if (!primaryContactId) {
    return { ok: false, error: "Link a CRM contact before saving documents." };
  }

  const { data: attachment, error: attErr } = await supabaseAdmin
    .from("phone_message_attachments")
    .select(
      "id, storage_path, storage_bucket, content_type, file_name, conversation_id, message_id"
    )
    .eq("id", attachmentId)
    .maybeSingle();

  if (attErr || !attachment?.storage_path || !attachment.storage_bucket) {
    return { ok: false, error: "Could not load attachment." };
  }
  const phoneBucket = String(attachment.storage_bucket);
  const phonePath = String(attachment.storage_path);
  if (phoneBucket !== PHONE_MESSAGE_MEDIA_BUCKET) {
    return { ok: false, error: "Unsupported attachment source." };
  }

  const mimeRaw =
    typeof attachment.content_type === "string" && attachment.content_type.trim()
      ? attachment.content_type.trim()
      : "application/octet-stream";
  if (!isAllowedLeadInsuranceMime(mimeRaw)) {
    return { ok: false, error: "Only JPG, PNG, WebP, or PDF can be linked as an insurance card." };
  }

  const { data: leadRow, error: leadErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, contact_id, primary_insurance_file_url, secondary_insurance_file_url")
      .eq("id", leadId)
      .maybeSingle()
  );

  if (leadErr || !leadRow?.id || String(leadRow.contact_id) !== primaryContactId) {
    return { ok: false, error: "That lead does not match this texting thread." };
  }

  const column =
    slot === "primary" ? ("primary_insurance_file_url" as const) : ("secondary_insurance_file_url" as const);
  const prevPath =
    typeof leadRow[column] === "string" && (leadRow[column] as string).trim()
      ? (leadRow[column] as string).trim()
      : "";

  const dl = await supabaseAdmin.storage.from(phoneBucket).download(phonePath);
  const blob = dl?.data ?? null;
  if (blob == null || dl.error) {
    console.warn("[sms-mms-save-lead] download:", dl?.error?.message);
    return { ok: false, error: "Could not download the MMS file." };
  }
  const ab = await blob.arrayBuffer();
  const buffer = Buffer.from(ab);
  if (buffer.byteLength < 16) {
    return { ok: false, error: "File appears empty." };
  }
  if (buffer.byteLength > LEAD_INSURANCE_MAX_BYTES) {
    return { ok: false, error: "File is larger than allowed for CRM insurance uploads." };
  }

  const origNameRaw =
    typeof attachment.file_name === "string" && attachment.file_name.trim()
      ? attachment.file_name.trim()
      : `insurance.${mimeRaw.includes("pdf") ? "pdf" : "jpg"}`;
  const safeBase = sanitizeLeadInsuranceFileName(origNameRaw);
  const storagePath = `${leadId}/${slot}-${Date.now()}-${safeBase}`;
  const ct = mimeRaw.split(";")[0]?.trim()?.toLowerCase() ?? "application/octet-stream";

  const up = await supabaseAdmin.storage.from(LEAD_INSURANCE_BUCKET).upload(storagePath, buffer, {
    contentType: ct,
    upsert: false,
  });
  if (up.error) {
    console.warn("[sms-mms-save-lead] lead upload:", up.error.message);
    return { ok: false, error: "Could not copy file to CRM storage." };
  }

  const { error: lu } = await supabaseAdmin.from("leads").update({ [column]: storagePath }).eq("id", leadId);
  if (lu) {
    console.warn("[sms-mms-save-lead] leads update:", lu.message);
    await supabaseAdmin.storage.from(LEAD_INSURANCE_BUCKET).remove([storagePath]).catch(() => {});
    return { ok: false, error: "Could not update the lead record." };
  }

  if (prevPath && prevPath !== storagePath) {
    await supabaseAdmin.storage.from(LEAD_INSURANCE_BUCKET).remove([prevPath]).catch(() => {});
  }

  const { error: actErr } = await supabaseAdmin.from("lead_activities").insert({
    lead_id: leadId,
    event_type: LEAD_ACTIVITY_EVENT.document_uploaded,
    body:
      slot === "primary"
        ? "Insurance card saved from MMS (primary)"
        : "Insurance card saved from MMS (secondary)",
    metadata: { slot, source: "sms_mms_attachment", attachment_id: attachmentId },
    created_by_user_id: staff.user_id,
    deletable: false,
  });
  if (actErr) {
    console.warn("[sms-mms-save-lead] lead activity:", actErr.message);
  }

  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  if (primaryContactId) {
    revalidatePath("/admin/crm/contacts");
    revalidatePath(`/admin/crm/contacts/${primaryContactId}`);
  }
  revalidatePath("/workspace/phone/inbox");
  return { ok: true };
}
