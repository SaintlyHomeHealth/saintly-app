"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { labelForContactType, normalizeCrmContactType } from "@/lib/crm/contact-types";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { UNKNOWN_TEXTER_METADATA_KEY } from "@/lib/phone/sms-conversation-thread";
import { mergeTelemetryOnSend, mergeTelemetryOnShown } from "@/lib/phone/sms-suggestion-telemetry";
import {
  canStaffAccessConversationRow,
  canStaffClaimConversation,
} from "@/lib/phone/staff-conversation-access";
import {
  loadContactForZapierByConversation,
  notifyZapierLeadStatus,
} from "@/lib/integrations/zapier-lead-status-webhook";
import { parseLeadStatus } from "@/lib/phone/lead-status";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { markInboundMessagesViewedForConversation } from "@/lib/phone/sms-inbound-unread";
import { sendSms } from "@/lib/twilio/send-sms";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  type StaffProfile,
} from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTAKE_NAME_MAX = 500;
const SMS_THREAD_CONTACT_NOTES_MAX = 8000;
const SMS_BODY_MAX = 1600;

function parseIntakeContactType(raw: unknown): "patient" | "family" | "referral" | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "patient" || s === "family" || s === "referral") return s;
  return null;
}

/**
 * Same gate as `/workspace/phone` and `/admin/phone/messages` UI: nurses may message without
 * `phone_access_enabled`; managers/admins/super_admins still require that flag.
 */
function requirePhoneMessagingStaff(staff: StaffProfile | null): staff is StaffProfile {
  if (!staff || !canAccessWorkspacePhone(staff)) return false;
  return true;
}

function revalidateSmsConversationViews(conversationId: string) {
  revalidatePath("/admin/phone/messages");
  revalidatePath(`/admin/phone/messages/${conversationId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath(`/workspace/phone/inbox/${conversationId}`);
}

type ConversationAccessRow = {
  id: string;
  assigned_to_user_id: string | null;
  primary_contact_id: string | null;
  main_phone_e164: string | null;
  lead_status: string | null;
};

async function loadConversationForAccess(
  conversationId: string
): Promise<{ row: ConversationAccessRow | null }> {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id, assigned_to_user_id, primary_contact_id, main_phone_e164, lead_status")
    .eq("id", conversationId)
    .eq("channel", "sms")
    .maybeSingle();

  if (error || !data?.id) {
    return { row: null };
  }

  return {
    row: {
      id: String(data.id),
      assigned_to_user_id:
        data.assigned_to_user_id != null && String(data.assigned_to_user_id).trim() !== ""
          ? String(data.assigned_to_user_id)
          : null,
      primary_contact_id:
        data.primary_contact_id != null && String(data.primary_contact_id).trim() !== ""
          ? String(data.primary_contact_id)
          : null,
      main_phone_e164: typeof data.main_phone_e164 === "string" ? data.main_phone_e164 : null,
      lead_status: typeof data.lead_status === "string" ? data.lead_status : null,
    },
  };
}

/** Marks inbound SMS as read for staff; revalidates inbox when any rows were updated. */
export async function markSmsThreadInboundViewed(conversationId: string) {
  if (process.env.SMS_MARK_INBOUND_VIEWED === "0") {
    return { ok: true as const, marked: 0 };
  }

  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) return { ok: false as const };
  if (!conversationId || !UUID_RE.test(conversationId)) return { ok: false as const };

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) return { ok: false as const };
  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false as const };
  }

  const marked = await markInboundMessagesViewedForConversation(conversationId);
  if (marked > 0) {
    revalidateSmsConversationViews(conversationId);
  }
  return { ok: true as const, marked };
}

export async function claimConversation(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return;
  }

  const raw = formData.get("conversationId");
  const conversationId = typeof raw === "string" ? raw.trim() : "";
  if (!conversationId || !UUID_RE.test(conversationId)) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    console.warn("[messages] claimConversation: not found", { conversationId });
    return;
  }

  if (!canStaffClaimConversation(staff, { assigned_to_user_id: row.assigned_to_user_id })) {
    return;
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .update({
      assigned_to_user_id: staff.user_id,
      assigned_at: now,
    })
    .eq("id", conversationId)
    .is("assigned_to_user_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[messages] claimConversation:", error.message);
    return;
  }
  if (!data?.id) {
    console.warn("[messages] claimConversation: already assigned", { conversationId });
  }

  revalidateSmsConversationViews(conversationId);
}

export async function assignConversation(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff) || !hasFullCallVisibility(staff)) {
    return;
  }

  const convRaw = formData.get("conversationId");
  const userRaw = formData.get("assignToUserId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
  const assignToUserId = typeof userRaw === "string" ? userRaw.trim() : "";
  if (!conversationId || !assignToUserId || !UUID_RE.test(assignToUserId)) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return;
  }

  const { data: target, error: tErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name, is_active")
    .eq("user_id", assignToUserId)
    .maybeSingle();

  if (tErr || !target?.user_id || target.is_active === false) {
    console.warn("[messages] assignConversation target:", tErr?.message);
    return;
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      assigned_to_user_id: assignToUserId,
      assigned_at: now,
    })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] assignConversation:", error.message);
    return;
  }

  revalidateSmsConversationViews(conversationId);
}

export async function unassignConversation(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff) || !isAdminOrHigher(staff)) {
    return;
  }

  const raw = formData.get("conversationId");
  const conversationId = typeof raw === "string" ? raw.trim() : "";
  if (!conversationId) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      assigned_to_user_id: null,
      assigned_at: null,
    })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] unassignConversation:", error.message);
    return;
  }

  revalidateSmsConversationViews(conversationId);
}

export async function updateConversationLeadStatus(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return;
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
  const statusRaw = formData.get("leadStatus");
  const leadStatus = parseLeadStatus(statusRaw);

  if (!conversationId || !UUID_RE.test(conversationId) || !leadStatus) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return;
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return;
  }

  const prevStatus = typeof row.lead_status === "string" ? row.lead_status.trim() : "";

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({ lead_status: leadStatus })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] updateConversationLeadStatus:", error.message);
    return;
  }

  const zapierStatuses = new Set(["contacted", "scheduled", "admitted"]);
  if (zapierStatuses.has(leadStatus) && prevStatus !== leadStatus) {
    const contact = await loadContactForZapierByConversation(row.primary_contact_id, row.main_phone_e164);
    const statusForZapier =
      leadStatus === "contacted" ? "spoke" : leadStatus === "scheduled" ? "scheduled" : "admitted";
    notifyZapierLeadStatus({
      email: contact.email,
      phone: contact.phone,
      status: statusForZapier,
      name: contact.name,
    });
  }

  revalidateSmsConversationViews(conversationId);
}

const NEXT_ACTION_MAX = 500;

function datetimeLocalToIso(dueRaw: string | null | undefined): string | null {
  if (!dueRaw) return null;
  const trimmed = String(dueRaw).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function updateConversationFollowUp(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return;
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
  const nextActionRaw = formData.get("nextAction");
  const dueRaw = formData.get("dueAt");

  const nextAction =
    typeof nextActionRaw === "string" ? nextActionRaw.trim().slice(0, NEXT_ACTION_MAX) : "";
  const dueIso = datetimeLocalToIso(typeof dueRaw === "string" ? dueRaw : null);

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return;
  }
  if (!nextAction && !dueIso) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return;
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      next_action: nextAction ? nextAction : null,
      follow_up_due_at: dueIso,
      follow_up_completed_at: null,
    })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] updateConversationFollowUp:", error.message);
    return;
  }

  revalidateSmsConversationViews(conversationId);
}

export async function completeConversationFollowUp(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return;
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return;
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return;
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({ follow_up_completed_at: now })
    .eq("id", conversationId)
    .is("follow_up_completed_at", null);

  if (error) {
    console.warn("[messages] completeConversationFollowUp:", error.message);
    return;
  }

  revalidateSmsConversationViews(conversationId);
}

export async function clearConversationFollowUp(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return;
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return;
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      next_action: null,
      follow_up_due_at: null,
      follow_up_completed_at: null,
    })
    .eq("id", conversationId)
    .is("follow_up_completed_at", null);

  if (error) {
    console.warn("[messages] clearConversationFollowUp:", error.message);
    return;
  }

  revalidateSmsConversationViews(conversationId);
}

function smsConversationRedirectPath(
  conversationId: string,
  workspaceReturn: boolean,
  query: Record<string, string>
): string {
  const base = workspaceReturn
    ? `/workspace/phone/inbox/${conversationId}`
    : `/admin/phone/messages/${conversationId}`;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export async function sendConversationSms(formData: FormData) {
  const staff = await getStaffProfile();
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  const workspaceReturn = returnTo === "workspace";

  const idRaw = formData.get("conversationId");
  const bodyRaw = formData.get("body");
  const conversationId = typeof idRaw === "string" ? idRaw.trim() : "";
  const body = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, SMS_BODY_MAX) : "";

  if (!requirePhoneMessagingStaff(staff)) {
    console.warn("[sms-send] blocked: staff cannot access workspace phone", {
      hasStaff: Boolean(staff),
      workspaceReturn,
    });
    redirect(workspaceReturn ? "/workspace/phone/inbox?err=sms_forbidden" : "/admin/phone?err=sms_forbidden");
  }

  console.log("[sms-ui] send submit", {
    conversationId,
    bodyLen: body.length,
    workspaceReturn,
  });

  if (!conversationId || !UUID_RE.test(conversationId) || !body) {
    console.warn("[sms-send] invalid conversation or empty body");
    redirect(workspaceReturn ? "/workspace/phone/inbox?err=sms_invalid" : "/admin/phone/messages?err=sms_invalid");
  }

  const { row } = await loadConversationForAccess(conversationId);
  const rawRecipient = row?.main_phone_e164 != null ? String(row.main_phone_e164).trim() : "";
  const normalizedRecipient =
    normalizeDialInputToE164(rawRecipient) ?? (isValidE164(rawRecipient) ? rawRecipient : "");
  const to = normalizedRecipient;

  console.log("[sms-send] resolved recipient", {
    conversationId,
    rawRecipient,
    normalizedRecipient: to,
    conversationExists: Boolean(row?.id),
  });

  if (!row?.main_phone_e164) {
    console.warn("[sms-db] sendConversationSms: missing row or phone", { conversationId });
    redirect(smsConversationRedirectPath(conversationId, workspaceReturn, { err: "sms_no_phone" }));
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    console.warn("[sms-send] forbidden: conversation row", { conversationId });
    redirect(smsConversationRedirectPath(conversationId, workspaceReturn, { err: "sms_forbidden" }));
  }

  if (!to || !isValidE164(to)) {
    console.warn("[sms-send] bad E.164 after normalize", { rawRecipient, to });
    redirect(smsConversationRedirectPath(conversationId, workspaceReturn, { err: "sms_bad_phone" }));
  }

  console.log("[sms-twilio] send start", { conversationId, to, bodyLen: body.length });
  const sent = await sendSms({ to, body });
  if (!sent.ok) {
    const errShort = sent.error.slice(0, 400);
    console.warn("[sms-twilio] send failed", errShort);
    redirect(
      smsConversationRedirectPath(conversationId, workspaceReturn, { err: "sms_twilio", smsErr: errShort })
    );
  }
  console.log("[sms-twilio] send ok", { conversationId, messageSid: sent.messageSid });

  const now = new Date().toISOString();

  const { error: insErr } = await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    body,
    external_message_sid: sent.messageSid,
    metadata: { sent_by_user_id: staff.user_id },
  });

  if (insErr) {
    console.warn("[sms-db] outbound insert failed", insErr.message);
    redirect(
      smsConversationRedirectPath(conversationId, workspaceReturn, {
        err: "sms_db",
        smsErr: insErr.message.slice(0, 400),
      })
    );
  }
  console.log("[sms-db] outbound insert ok", { conversationId });

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

  const { error: touchErr } = await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: now, updated_at: now, metadata: nextMeta })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[sms-db] conversation touch after send:", touchErr.message);
  }

  revalidateSmsConversationViews(conversationId);
  redirect(smsConversationRedirectPath(conversationId, workspaceReturn, { ok: "sms_sent" }));
}

/** Fire once when the thread UI shows an AI suggestion (idempotent per for_message_id). */
export async function recordSmsSuggestionShown(conversationId: string, forMessageId: string) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return;
  }

  if (!conversationId || !UUID_RE.test(conversationId) || !forMessageId || !UUID_RE.test(forMessageId)) {
    return;
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return;
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return;
  }

  const { data: convRow, error: selErr } = await supabaseAdmin
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  if (selErr) {
    console.warn("[messages] recordSmsSuggestionShown select:", selErr.message);
    return;
  }

  const meta: Record<string, unknown> =
    convRow?.metadata != null && typeof convRow.metadata === "object" && !Array.isArray(convRow.metadata)
      ? { ...(convRow.metadata as Record<string, unknown>) }
      : {};

  const nextTel = mergeTelemetryOnShown(meta, forMessageId);
  if (!nextTel) {
    return;
  }

  const { error: upErr } = await supabaseAdmin
    .from("conversations")
    .update({ metadata: { ...meta, sms_suggestion_telemetry: nextTel } })
    .eq("id", conversationId);

  if (upErr) {
    console.warn("[messages] recordSmsSuggestionShown update:", upErr.message);
    return;
  }

  revalidateSmsConversationViews(conversationId);
}

export async function createContactIntakeFromConversation(formData: FormData) {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    redirect("/admin");
  }

  const convId = String(formData.get("conversationId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  const workspaceReturn = returnTo === "workspace";
  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const fullNameInput = String(formData.get("fullName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const intakeType = parseIntakeContactType(formData.get("intakeType"));
  const email = String(formData.get("email") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const stateVal = String(formData.get("state") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const referralSource = String(formData.get("referralSource") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const intakeErr = (code: string) => {
    if (convId && UUID_RE.test(convId)) {
      redirect(
        workspaceReturn
          ? `/workspace/phone/inbox/${convId}?err=${code}`
          : `/admin/phone/messages/${convId}?err=${code}`
      );
    }
    redirect(workspaceReturn ? `/workspace/phone/inbox?err=${code}` : `/admin/phone/messages?err=${code}`);
  };

  if (!convId || !UUID_RE.test(convId)) {
    intakeErr("intake");
  }
  if (!intakeType) {
    intakeErr("intake");
  }

  if (!fullNameInput && !firstName) {
    intakeErr("intake");
  }

  const derivedFullName =
    fullNameInput || [firstName, lastName].filter(Boolean).join(" ").trim();

  const phoneE164 = normalizeDialInputToE164(phoneRaw);
  if (!phoneE164 || !isValidE164(phoneE164)) {
    intakeErr("intake_phone");
  }
  if (!derivedFullName) {
    intakeErr("intake");
  }

  const { row } = await loadConversationForAccess(convId);
  if (!row) {
    intakeErr("intake");
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row!.assigned_to_user_id,
    })
  ) {
    intakeErr("intake_forbidden");
  }

  if (row!.primary_contact_id) {
    intakeErr("intake_exists");
  }

  const byPhone = await findContactByIncomingPhone(supabaseAdmin, phoneE164);
  let contactId: string;

  const contactPatch: Record<string, unknown> = {
    full_name: derivedFullName,
    primary_phone: phoneE164,
    contact_type: intakeType,
  };

  if (firstName) contactPatch.first_name = firstName;
  if (lastName) contactPatch.last_name = lastName;
  if (email) contactPatch.email = email;
  if (addressLine1) contactPatch.address_line_1 = addressLine1;
  if (city) contactPatch.city = city;
  if (stateVal) contactPatch.state = stateVal;
  if (zip) contactPatch.zip = zip;
  if (referralSource) contactPatch.referral_source = referralSource;
  if (notes) contactPatch.notes = notes;

  if (byPhone?.id) {
    contactId = byPhone.id;
    const { error: upErr } = await supabaseAdmin
      .from("contacts")
      .update(contactPatch)
      .eq("id", contactId);

    if (upErr) {
      console.warn("[messages] intake update contact:", upErr.message);
      intakeErr("intake");
    }
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert(contactPatch)
      .select("id")
      .single();

    const newId = inserted?.id;
    if (insErr || !newId) {
      console.warn("[messages] intake insert:", insErr?.message);
      intakeErr("intake");
    }
    contactId = String(newId);
  }

  const { data: convMetaRow } = await supabaseAdmin
    .from("conversations")
    .select("metadata")
    .eq("id", convId)
    .maybeSingle();

  const prevMeta =
    convMetaRow?.metadata &&
    typeof convMetaRow.metadata === "object" &&
    !Array.isArray(convMetaRow.metadata)
      ? ({ ...convMetaRow.metadata } as Record<string, unknown>)
      : {};
  delete prevMeta[UNKNOWN_TEXTER_METADATA_KEY];
  delete prevMeta.auto_intake_at;

  const { error: linkErr } = await supabaseAdmin
    .from("conversations")
    .update({
      primary_contact_id: contactId,
      metadata: prevMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", convId)
    .is("primary_contact_id", null);

  if (linkErr) {
    console.warn("[messages] intake link:", linkErr.message);
    intakeErr("intake");
  }

  revalidateSmsConversationViews(convId);
  if (workspaceReturn) {
    redirect(`/workspace/phone/inbox/${convId}?ok=intake`);
  }
  redirect(`/admin/phone/messages/${convId}?ok=intake`);
}

export type SaveSmsThreadContactResult =
  | { ok: true; displayName: string; badgeLabel: string; primaryContactId: string }
  | { ok: false; error: string };

async function workspaceBadgeLabelForContact(
  contactId: string,
  contactTypeFallback: string | null
): Promise<string> {
  const { data: patRow } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (patRow && typeof (patRow as { id?: string }).id === "string") {
    return "Patient";
  }
  const { data: leadRow } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id").eq("contact_id", contactId).limit(1)
  ).maybeSingle();
  if (leadRow && typeof (leadRow as { id?: string }).id === "string") {
    return "Lead";
  }
  const ct = (contactTypeFallback ?? "").trim();
  if (ct) {
    const lab = labelForContactType(ct);
    if (lab !== "—") return lab;
  }
  return "Contact";
}

/**
 * Create or update the CRM contact for the current SMS thread (workspace quick editor).
 * Returns JSON so the client can refresh the thread header without a full redirect.
 */
export async function saveSmsThreadContact(formData: FormData): Promise<SaveSmsThreadContactResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const fullNameRaw = String(formData.get("fullName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const email = String(formData.get("email") ?? "").trim().slice(0, 500);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, SMS_THREAD_CONTACT_NOTES_MAX);
  const tags = String(formData.get("tags") ?? "").trim().slice(0, 500);
  const contactTypeRaw = String(formData.get("contactType") ?? "").trim().toLowerCase();
  const normalizedType = normalizeCrmContactType(contactTypeRaw) ?? "other";

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return { ok: false, error: "Invalid conversation." };
  }
  if (!fullNameRaw) {
    return { ok: false, error: "Name is required." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this thread." };
  }

  const phoneE164 =
    typeof row.main_phone_e164 === "string" && row.main_phone_e164.trim()
      ? row.main_phone_e164.trim()
      : "";
  if (!phoneE164 || !isValidE164(phoneE164)) {
    return { ok: false, error: "This thread has no valid phone number." };
  }

  const notesCombined =
    tags && notes
      ? `${notes}\n\nTags: ${tags}`
      : tags
        ? `Tags: ${tags}`
        : notes;

  const contactPatch: Record<string, unknown> = {
    full_name: fullNameRaw,
    contact_type: normalizedType,
    primary_phone: phoneE164,
    updated_at: new Date().toISOString(),
  };
  if (email) contactPatch.email = email;
  contactPatch.notes = notesCombined ? notesCombined : null;

  let contactId: string;

  if (row.primary_contact_id && String(row.primary_contact_id).trim()) {
    contactId = String(row.primary_contact_id).trim();
    const { error: upErr } = await supabaseAdmin.from("contacts").update(contactPatch).eq("id", contactId);
    if (upErr) {
      console.warn("[messages] saveSmsThreadContact update:", upErr.message);
      return { ok: false, error: upErr.message || "Could not update contact." };
    }
  } else {
    const byPhone = await findContactByIncomingPhone(supabaseAdmin, phoneE164);
    if (byPhone?.id) {
      contactId = byPhone.id;
      const { error: upErr } = await supabaseAdmin.from("contacts").update(contactPatch).eq("id", contactId);
      if (upErr) {
        console.warn("[messages] saveSmsThreadContact upsert by phone:", upErr.message);
        return { ok: false, error: upErr.message || "Could not save contact." };
      }
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("contacts")
        .insert(contactPatch)
        .select("id")
        .single();
      const newId = inserted?.id;
      if (insErr || !newId) {
        console.warn("[messages] saveSmsThreadContact insert:", insErr?.message);
        return { ok: false, error: insErr?.message || "Could not create contact." };
      }
      contactId = String(newId);
    }

    const { data: convMetaRow } = await supabaseAdmin
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .maybeSingle();

    const prevMeta =
      convMetaRow?.metadata &&
      typeof convMetaRow.metadata === "object" &&
      !Array.isArray(convMetaRow.metadata)
        ? ({ ...convMetaRow.metadata } as Record<string, unknown>)
        : {};
    delete prevMeta[UNKNOWN_TEXTER_METADATA_KEY];
    delete prevMeta.auto_intake_at;

    const { error: linkErr } = await supabaseAdmin
      .from("conversations")
      .update({
        primary_contact_id: contactId,
        main_phone_e164: phoneE164,
        metadata: prevMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (linkErr) {
      console.warn("[messages] saveSmsThreadContact link:", linkErr.message);
      return { ok: false, error: linkErr.message || "Could not link contact to thread." };
    }
  }

  const badgeLabel = await workspaceBadgeLabelForContact(contactId, normalizedType);

  revalidateSmsConversationViews(conversationId);

  return {
    ok: true,
    displayName: fullNameRaw,
    badgeLabel,
    primaryContactId: contactId,
  };
}
