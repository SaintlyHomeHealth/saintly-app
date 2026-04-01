import "server-only";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { SMS_REMINDER_CREDENTIAL_TYPE_SET } from "@/lib/admin/credential-sms-constants";
import { applicantRolePrimaryForCompliance } from "@/lib/applicant-role-for-compliance";
import { getRequiredCredentialTypes, normalizeCredentialTypeKey } from "@/lib/admin/employee-directory-data";
import {
  appendOutboundSmsToConversation,
  ensureSmsConversationForOutboundSystem,
} from "@/lib/phone/sms-conversation-thread";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { sendSms } from "@/lib/twilio/send-sms";

export type CredentialReminderStage = "due_soon_30" | "due_soon_7" | "expired" | "missing";

export type CredentialReminderTarget = {
  credentialType: string;
  stage: CredentialReminderStage;
  expirationAnchor: string;
  shortLabel: string;
  detailLine: string;
};

export type CredentialReminderTrigger = "manual" | "cron";

const LABELS: Record<string, string> = {
  professional_license: "Professional license",
  cpr: "CPR/BLS",
  tb_expiration: "TB (PPD/test)",
  drivers_license: "Driver license",
  auto_insurance: "Auto insurance",
  independent_contractor_insurance: "Contractor liability insurance",
};

function getDaysRemaining(dateString?: string | null): number | null {
  if (!dateString) return null;
  const today = new Date();
  const expiration = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00` : dateString
  );
  today.setHours(0, 0, 0, 0);
  expiration.setHours(0, 0, 0, 0);
  if (Number.isNaN(expiration.getTime())) return null;
  return Math.ceil((expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function credentialStateLabel(
  credentialType: string,
  credentials: Array<{ credential_type: string; expiration_date: string | null }>
): "Missing" | "Expired" | "Due Soon" | "Active" {
  const matches = credentials.filter(
    (c) => normalizeCredentialTypeKey(c.credential_type) === credentialType
  );
  if (matches.length === 0) return "Missing";
  const credential = matches
    .slice()
    .sort((a, b) => (b.expiration_date || "").localeCompare(a.expiration_date || ""))[0];
  const daysRemaining = getDaysRemaining(credential?.expiration_date);
  if (daysRemaining === null) return "Missing";
  if (daysRemaining < 0) return "Expired";
  if (daysRemaining <= 30) return "Due Soon";
  return "Active";
}

function dueSoonStageFromDays(days: number): "due_soon_30" | "due_soon_7" {
  if (days <= 7) return "due_soon_7";
  return "due_soon_30";
}

function expirationAnchorFor(
  credentialType: string,
  credentials: Array<{ credential_type: string; expiration_date: string | null }>
): string {
  const matches = credentials.filter(
    (c) => normalizeCredentialTypeKey(c.credential_type) === credentialType
  );
  if (matches.length === 0) return "missing";
  const credential = matches
    .slice()
    .sort((a, b) => (b.expiration_date || "").localeCompare(a.expiration_date || ""))[0];
  const exp = credential?.expiration_date;
  if (!exp || typeof exp !== "string") return "missing";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(exp) ? `${exp}T12:00:00` : exp);
  if (Number.isNaN(d.getTime())) return "missing";
  return d.toISOString().slice(0, 10);
}

function formatUsDate(isoYmd: string): string {
  const [y, m, d] = isoYmd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return isoYmd;
  return `${m}/${d}/${y}`;
}

/**
 * Eligible credential SMS targets for SMS-scoped types: due ≤30d (split 30 vs 7), expired, or missing.
 */
export function buildCredentialReminderTargets(
  requiredTypes: readonly string[],
  credentials: Array<{ credential_type: string; expiration_date: string | null }>
): CredentialReminderTarget[] {
  const remind = SMS_REMINDER_CREDENTIAL_TYPE_SET;
  const out: CredentialReminderTarget[] = [];

  for (const ct of requiredTypes) {
    if (!remind.has(ct)) continue;
    const label = LABELS[ct] || ct.replace(/_/g, " ");
    const state = credentialStateLabel(ct, credentials);
    if (state === "Active") continue;

    const anchor = expirationAnchorFor(ct, credentials);
    const expRow = credentials.find((c) => normalizeCredentialTypeKey(c.credential_type) === ct);
    const days = getDaysRemaining(expRow?.expiration_date ?? null);

    let stage: CredentialReminderStage;
    if (state === "Missing") {
      stage = "missing";
    } else if (state === "Expired") {
      stage = "expired";
    } else {
      if (typeof days !== "number") {
        stage = "missing";
      } else {
        stage = dueSoonStageFromDays(days);
      }
    }

    let detailLine = "";
    if (stage === "missing") {
      detailLine = `${label}: not on file — please upload/update in onboarding.`;
    } else if (stage === "expired") {
      detailLine = `${label}: expired (exp ${formatUsDate(anchor)}).`;
    } else if (stage === "due_soon_7") {
      detailLine = `${label}: due soon${typeof days === "number" ? ` (${days}d left, exp ${formatUsDate(anchor)})` : ""} — please renew.`;
    } else {
      detailLine = `${label}: coming due${typeof days === "number" ? ` (${days}d, exp ${formatUsDate(anchor)})` : ""}.`;
    }

    out.push({
      credentialType: ct,
      stage,
      expirationAnchor: anchor,
      shortLabel: label,
      detailLine,
    });
  }

  return out;
}

async function loadDedupedTargets(
  applicantId: string,
  targets: CredentialReminderTarget[]
): Promise<CredentialReminderTarget[]> {
  const unsent: CredentialReminderTarget[] = [];
  for (const t of targets) {
    const { data } = await supabaseAdmin
      .from("employee_credential_reminder_sends")
      .select("id")
      .eq("applicant_id", applicantId)
      .eq("credential_type", t.credentialType)
      .eq("expiration_anchor", t.expirationAnchor)
      .eq("reminder_stage", t.stage)
      .maybeSingle();
    if (!data?.id) unsent.push(t);
  }
  return unsent;
}

function buildSmsBody(firstName: string, lines: string[]): string {
  const greeting = firstName.trim() ? `Hi ${firstName.trim()}, ` : "";
  const core =
    lines.length === 1
      ? lines[0]
      : `Multiple items need attention:\n${lines.map((l) => `• ${l}`).join("\n")}`;
  const tail =
    " — Saintly Home Health. Please complete updates in your employee onboarding or contact the office.";
  const base = `${greeting}${core}${tail}`;
  if (base.length <= 300) return base;
  return `${greeting}Several credentials need renewal or upload — please check your Saintly onboarding portal or call the office.${tail}`;
}

export type PrepareCredentialReminderResult =
  | {
      ok: true;
      applicantId: string;
      firstName: string;
      e164: string | null;
      rawTargets: CredentialReminderTarget[];
      targetsToSend: CredentialReminderTarget[];
      skippedDuplicate: number;
    }
  | { ok: false; applicantId: string; error: string };

/**
 * Loads applicant + credentials, builds targets, applies dedupe. Does not send.
 * @param excludeMissing — when true (daily cron), only expired / 30d / 7d windows; missing credentials are omitted.
 */
export async function prepareEmployeeCredentialReminderSend(
  applicantId: string,
  options?: { excludeMissing?: boolean }
): Promise<PrepareCredentialReminderResult> {
  const excludeMissing = options?.excludeMissing === true;

  const { data: applicant, error: appErr } = await supabaseAdmin
    .from("applicants")
    .select("id, first_name, last_name, phone, position, discipline")
    .eq("id", applicantId)
    .maybeSingle();

  if (appErr || !applicant?.id) {
    return { ok: false, applicantId, error: appErr?.message || "Applicant not found" };
  }

  const { data: contract } = await supabaseAdmin
    .from("employee_contracts")
    .select("employment_classification")
    .eq("applicant_id", applicantId)
    .eq("is_current", true)
    .maybeSingle();

  const classification =
    contract?.employment_classification === "contractor" ||
    contract?.employment_classification === "employee"
      ? contract.employment_classification
      : null;

  const required = getRequiredCredentialTypes(
    applicantRolePrimaryForCompliance({
      position: applicant.position as string | null,
      discipline: applicant.discipline as string | null,
    }),
    classification
  );

  const { data: credRows, error: credErr } = await supabaseAdmin
    .from("employee_credentials")
    .select("credential_type, expiration_date")
    .eq("employee_id", applicantId);

  if (credErr) {
    return { ok: false, applicantId, error: credErr.message };
  }

  const credentials = (credRows || []) as Array<{ credential_type: string; expiration_date: string | null }>;

  let rawTargets = buildCredentialReminderTargets(required, credentials);
  if (excludeMissing) {
    rawTargets = rawTargets.filter((t) => t.stage !== "missing");
  }

  const targetsToSend = await loadDedupedTargets(applicantId, rawTargets);
  const skippedDuplicate = rawTargets.length - targetsToSend.length;

  const phoneRaw = typeof applicant.phone === "string" ? applicant.phone : "";
  const e164 = normalizeDialInputToE164(phoneRaw);
  const validE164 = e164 && isValidE164(e164) ? e164 : null;

  const firstName = typeof applicant.first_name === "string" ? applicant.first_name : "";

  return {
    ok: true,
    applicantId,
    firstName,
    e164: validE164,
    rawTargets,
    targetsToSend,
    skippedDuplicate,
  };
}

export type SendCredentialReminderResult =
  | {
      ok: true;
      sent: number;
      skippedDuplicate: number;
      twilioMessageSid: string | null;
      preview: string;
    }
  | { ok: false; error: string };

/**
 * Persists Twilio send + `employee_credential_reminder_sends` + conversation message.
 * Caller must ensure targets non-empty and e164 valid.
 */
export async function commitEmployeeCredentialReminderSend(input: {
  applicantId: string;
  firstName: string;
  e164: string;
  targets: CredentialReminderTarget[];
  staffUserId: string | null;
  trigger: CredentialReminderTrigger;
  /** When true, skip per-send revalidation (e.g. batch cron revalidates once). */
  skipRevalidate?: boolean;
}): Promise<SendCredentialReminderResult> {
  const { applicantId, firstName, e164, targets, staffUserId, trigger, skipRevalidate } = input;

  if (targets.length === 0) {
    return { ok: false, error: "No targets to send" };
  }

  const body = buildSmsBody(
    firstName,
    targets.map((t) => t.detailLine)
  );

  const conv = await ensureSmsConversationForOutboundSystem(supabaseAdmin, e164);
  if (!conv.ok) {
    return { ok: false, error: conv.error };
  }

  const sms = await sendSms({ to: e164, body });
  if (!sms.ok) {
    return { ok: false, error: sms.error };
  }

  const meta = {
    source: "employee_credential_reminder",
    trigger,
    applicant_id: applicantId,
    credential_types: targets.map((t) => t.credentialType),
    stages: targets.map((t) => t.stage),
    phone_e164: e164,
  };

  const appended = await appendOutboundSmsToConversation(supabaseAdmin, {
    conversationId: conv.conversationId,
    body,
    messageSid: sms.messageSid,
    metadata: meta,
  });

  if (!appended.ok) {
    console.warn("[credential-reminder-sms] log message row failed:", appended.error);
  }

  const preview = body.slice(0, 280);
  const rows = targets.map((t) => ({
    applicant_id: applicantId,
    credential_type: t.credentialType,
    reminder_stage: t.stage,
    expiration_anchor: t.expirationAnchor,
    staff_user_id: staffUserId,
    twilio_message_sid: sms.messageSid,
    body_preview: preview,
    metadata: meta,
  }));

  const { error: insErr } = await supabaseAdmin.from("employee_credential_reminder_sends").insert(rows);

  if (insErr) {
    console.error("[credential-reminder-sms] insert audit rows:", insErr.message);
    return { ok: false, error: `SMS sent but logging failed: ${insErr.message}` };
  }

  if (!skipRevalidate) {
    revalidatePath("/admin/employees");
  }

  return {
    ok: true,
    sent: targets.length,
    skippedDuplicate: 0,
    twilioMessageSid: sms.messageSid,
    preview,
  };
}

/**
 * Sends one SMS summarizing all pending (non-deduped) credential reminders for an applicant (manual admin action).
 */
export async function sendEmployeeCredentialReminderSms(input: {
  applicantId: string;
  staffUserId: string | null;
}): Promise<SendCredentialReminderResult> {
  const { applicantId, staffUserId } = input;

  const prep = await prepareEmployeeCredentialReminderSend(applicantId, { excludeMissing: false });
  if (!prep.ok) {
    return { ok: false, error: prep.error };
  }

  if (prep.rawTargets.length === 0) {
    return { ok: false, error: "No due, expired, or missing credentials in SMS scope for this employee." };
  }

  if (prep.targetsToSend.length === 0) {
    return { ok: false, error: "Reminders already sent for current items (no new messages)." };
  }

  if (!prep.e164) {
    return { ok: false, error: "Employee has no valid mobile number on file." };
  }

  const commit = await commitEmployeeCredentialReminderSend({
    applicantId,
    firstName: prep.firstName,
    e164: prep.e164,
    targets: prep.targetsToSend,
    staffUserId,
    trigger: "manual",
    skipRevalidate: false,
  });

  if (!commit.ok) {
    return commit;
  }

  return {
    ok: true,
    sent: commit.sent,
    skippedDuplicate: prep.skippedDuplicate,
    twilioMessageSid: commit.twilioMessageSid,
    preview: commit.preview,
  };
}

/** Count lines by stage for cron summaries. */
export function countCredentialReminderTargetsByStage(targets: CredentialReminderTarget[]): {
  sent_30_day: number;
  sent_7_day: number;
  sent_expired: number;
} {
  let sent_30_day = 0;
  let sent_7_day = 0;
  let sent_expired = 0;
  for (const t of targets) {
    if (t.stage === "due_soon_30") sent_30_day += 1;
    else if (t.stage === "due_soon_7") sent_7_day += 1;
    else if (t.stage === "expired") sent_expired += 1;
  }
  return { sent_30_day, sent_7_day, sent_expired };
}
