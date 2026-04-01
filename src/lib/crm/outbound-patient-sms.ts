import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { supabaseAdmin } from "@/lib/admin";
import { sendSms } from "@/lib/twilio/send-sms";

export const CRM_PATIENT_SMS_MAX_LEN = 1600;

function pickOutboundE164(raw: string | null | undefined): string | null {
  const candidates = phoneLookupCandidates(raw);
  return candidates.find((x) => x.startsWith("+")) ?? null;
}

/** Primary = patient phone; secondary = caregiver / alternate. */
export type OutboundSmsRecipient = "patient" | "caregiver" | "both";

export type SendOutboundPatientSmsResult = { ok: true } | { ok: false; error: string };

async function sendSmsToContactPhones(
  contactId: string,
  body: string,
  recipient: OutboundSmsRecipient
): Promise<SendOutboundPatientSmsResult> {
  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id, primary_phone, secondary_phone")
    .eq("id", contactId)
    .maybeSingle();

  if (cErr || !contactRow?.id) {
    return { ok: false, error: "Contact not found." };
  }

  const primaryPhone = typeof contactRow.primary_phone === "string" ? contactRow.primary_phone : null;
  const secondaryPhone = typeof contactRow.secondary_phone === "string" ? contactRow.secondary_phone : null;

  const toPrimary = pickOutboundE164(primaryPhone);
  const toSecondary = pickOutboundE164(secondaryPhone);

  const targets: string[] = [];
  if (recipient === "patient" || recipient === "both") {
    if (!toPrimary) {
      return { ok: false, error: "No valid primary phone on file." };
    }
    targets.push(toPrimary);
  }
  if (recipient === "caregiver" || recipient === "both") {
    if (!toSecondary) {
      return { ok: false, error: "No valid alternate phone on file." };
    }
    targets.push(toSecondary);
  }

  const unique = [...new Set(targets)];
  for (const to of unique) {
    const result = await sendSms({ to, body });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
  }

  return { ok: true };
}

/**
 * Sends SMS to contact primary / secondary phones. No auth —
 * callers must enforce permissions (CRM admin, nurse assignment, cron).
 */
export async function sendOutboundSmsForContact(
  contactId: string,
  message: string,
  recipient: OutboundSmsRecipient
): Promise<SendOutboundPatientSmsResult> {
  const cid = contactId.trim();
  const body = message.trim();
  if (!cid) {
    return { ok: false, error: "Missing contact." };
  }
  if (!body) {
    return { ok: false, error: "Message is required." };
  }
  if (body.length > CRM_PATIENT_SMS_MAX_LEN) {
    return { ok: false, error: `Message must be at most ${CRM_PATIENT_SMS_MAX_LEN} characters.` };
  }

  return sendSmsToContactPhones(cid, body, recipient);
}

/**
 * Sends SMS to patient primary and/or caregiver (secondary) phone. No auth —
 * callers must enforce permissions (CRM admin, nurse assignment, cron).
 */
export async function sendOutboundSmsForPatient(
  patientId: string,
  message: string,
  recipient: OutboundSmsRecipient
): Promise<SendOutboundPatientSmsResult> {
  const pid = patientId.trim();
  const body = message.trim();
  if (!pid) {
    return { ok: false, error: "Missing patient." };
  }
  if (!body) {
    return { ok: false, error: "Message is required." };
  }
  if (body.length > CRM_PATIENT_SMS_MAX_LEN) {
    return { ok: false, error: `Message must be at most ${CRM_PATIENT_SMS_MAX_LEN} characters.` };
  }

  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select("id, contact_id")
    .eq("id", pid)
    .maybeSingle();

  if (pErr || !patientRow?.contact_id) {
    return { ok: false, error: "Patient not found." };
  }

  return sendSmsToContactPhones(patientRow.contact_id as string, body, recipient);
}
