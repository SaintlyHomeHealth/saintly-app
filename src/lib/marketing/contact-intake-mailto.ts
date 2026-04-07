import { MAILTO_INTAKE } from "@/components/marketing/marketing-constants";

export const CONTACT_RELATION_OPTIONS = [
  { value: "self", label: "Patient / self" },
  { value: "family", label: "Family member" },
  { value: "referral", label: "Referral source (physician, hospital, etc.)" },
] as const;

export const CONTACT_SERVICE_OPTIONS = [
  { value: "general", label: "General question" },
  { value: "wound", label: "Wound care" },
  { value: "nursing", label: "Skilled nursing" },
  { value: "therapy", label: "Therapy (PT / OT / ST)" },
] as const;

export type ContactIntakePayload = {
  name: string;
  phone: string;
  email: string;
  relation: string;
  service: string;
  message: string;
  /** Required true for A2P compliance when requesting SMS. */
  sms_consent: boolean;
};

export function buildContactIntakeMailtoHref(input: ContactIntakePayload): { ok: true; href: string } | { ok: false; error: string } {
  if (input.sms_consent !== true) {
    return { ok: false, error: "sms_consent_required" };
  }

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    return { ok: false, error: "validation_name" };
  }

  const relLabel = CONTACT_RELATION_OPTIONS.find((r) => r.value === input.relation)?.label ?? input.relation;
  const svcLabel = CONTACT_SERVICE_OPTIONS.find((s) => s.value === input.service)?.label ?? input.service;

  const bodyLines = [
    `Name: ${trimmedName}`,
    `Phone: ${input.phone.trim() || "—"}`,
    `Email: ${input.email.trim() || "—"}`,
    `I am: ${relLabel}`,
    `Service needed: ${svcLabel}`,
    "",
    `SMS consent: Yes (website intake form; A2P opt-in recorded at submit)`,
    "",
    input.message.trim() || "(no additional message)",
  ];

  const subject = encodeURIComponent("Intake inquiry — Saintly Home Health");
  const body = encodeURIComponent(bodyLines.join("\n"));
  const href = `${MAILTO_INTAKE}?subject=${subject}&body=${body}`;

  if (href.length > 1800) {
    return { ok: false, error: "message_too_long" };
  }

  return { ok: true, href };
}
