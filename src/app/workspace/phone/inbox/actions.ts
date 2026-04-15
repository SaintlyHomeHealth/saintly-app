"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mergeTelemetryOnSend } from "@/lib/phone/sms-suggestion-telemetry";
import { ensureSmsConversationForPhone } from "@/lib/phone/sms-conversation-thread";
import { resolveContactAndPhoneForWorkspaceNewSms } from "@/lib/phone/workspace-new-sms-resolve";
import { getTwilioSmsOutboundDiagnostics } from "@/lib/twilio/sms-outbound-diagnostics";
import { sendSms } from "@/lib/twilio/send-sms";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

const SMS_BODY_MAX = 1600;

async function requirePhoneMessagingStaff() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }
  return staff;
}

function revalidateSmsViews(conversationId: string) {
  revalidatePath("/admin/phone/messages");
  revalidatePath(`/admin/phone/messages/${conversationId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/workspace/phone/inbox/new");
  revalidatePath(`/workspace/phone/inbox/${conversationId}`);
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
  if (!staff || !canAccessWorkspacePhone(staff)) {
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
export async function sendWorkspaceNewSms(formData: FormData) {
  const staff = await requirePhoneMessagingStaff();

  const bodyRaw = formData.get("body");
  const body = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, SMS_BODY_MAX) : "";
  const phoneRaw = typeof formData.get("phone") === "string" ? formData.get("phone")!.toString() : "";
  const contactIdRaw = formData.get("contactId");
  const recruitIdRaw = formData.get("recruitingCandidateId");
  const contactId = typeof contactIdRaw === "string" ? contactIdRaw.trim() : "";
  const recruitingCandidateId = typeof recruitIdRaw === "string" ? recruitIdRaw.trim() : "";

  const err = (code: string) => redirect(`/workspace/phone/inbox/new?err=${code}`);

  if (!body) {
    err("sms_empty");
  }

  const resolved = await resolveContactAndPhoneForWorkspaceNewSms({
    phoneRaw,
    contactId: contactId || null,
    recruitingCandidateId: recruitingCandidateId || null,
  });

  if (!resolved.ok) {
    err(mapResolveError(resolved.error));
  }

  const { e164, contact } = resolved;

  console.log("[workspace-new-sms] step=resolve ok", {
    e164,
    hasContactId: Boolean(contact?.id),
  });

  /**
   * Same as inbound SMS (`applyInboundTwilioSms`): omit `leadStatusOnCreate` so `lead_status` uses the
   * column default (`new_lead`). Do not use `unclassified` here — DBs that have not applied migration
   * `20260330160000_conversations_lead_status_unclassified.sql` reject that value on insert.
   */
  const ensured = await ensureSmsConversationForPhone(supabaseAdmin, e164, contact);

  if (!ensured.ok) {
    console.error("[workspace-new-sms] step=ensure_thread FAILED (before Twilio)", {
      ensureError: ensured.error,
      e164,
    });
    redirect(
      `/workspace/phone/inbox/new?err=sms_thread&threadErr=${encodeURIComponent(ensured.error.slice(0, 500))}`
    );
  }

  const conversationId = ensured.conversationId;

  console.log("[workspace-new-sms] step=ensure_thread ok", { conversationId, e164 });

  const smsCfg = getTwilioSmsOutboundDiagnostics();
  console.log("[workspace-new-sms] step=before_twilio_send", {
    conversationId,
    e164,
    credentialsComplete: smsCfg.credentialsComplete,
    missingEnvVars: smsCfg.missingEnvVars,
    outboundSenderMasked: smsCfg.outboundSenderMasked,
    outboundMode: smsCfg.outboundMode,
  });

  const sent = await sendSms({ to: e164, body });

  if (!sent.ok) {
    console.error("[workspace-new-sms] step=twilio_send FAILED (after conversation row)", {
      conversationId,
      error: sent.error,
    });
    const errShort = sent.error.slice(0, 600);
    redirect(`/workspace/phone/inbox/new?smsErr=${encodeURIComponent(errShort)}`);
  }

  console.log("[workspace-new-sms] step=twilio_send ok", { conversationId });

  const now = new Date().toISOString();

  const { error: insErr } = await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    body,
    external_message_sid: sent.messageSid,
    metadata: { sent_by_user_id: staff.user_id, source: "workspace_new_sms" },
  });

  if (insErr) {
    console.warn("[workspace-new-sms] message insert:", insErr.message);
    redirect(
      `/workspace/phone/inbox/new?smsErr=${encodeURIComponent(insErr.message.slice(0, 400))}`
    );
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

  const { error: touchErr } = await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: now, updated_at: now, metadata: nextMeta })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[workspace-new-sms] touch conversation:", touchErr.message);
  }

  revalidateSmsViews(conversationId);
  redirect(`/workspace/phone/inbox/${conversationId}?ok=sms_sent`);
}

function mapResolveError(
  code: "bad_phone" | "contact_no_phone" | "recruit_no_phone" | "contact_not_found" | "contact_create_failed"
): string {
  switch (code) {
    case "bad_phone":
      return "sms_bad_phone";
    case "contact_no_phone":
      return "sms_contact_no_phone";
    case "recruit_no_phone":
      return "sms_recruit_no_phone";
    case "contact_not_found":
      return "sms_contact_missing";
    case "contact_create_failed":
      return "sms_contact_create";
    default:
      return "sms_resolve";
  }
}
