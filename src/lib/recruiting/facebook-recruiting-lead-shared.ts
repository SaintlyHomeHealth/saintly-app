/** Pure helpers for Facebook PT recruiting lead SMS + staff notifications (safe for verify scripts). */

export const FACEBOOK_RECRUITING_INTRO_SMS_CALLBACK_PHONE = "480-360-0008";

export const FACEBOOK_RECRUITING_FORM_CONSENT_LANGUAGE =
  "We'll use the information you provide to contact you about Physical Therapist visit opportunities with Saintly Home Health. Your information may be used to confirm your interest, review your availability, and follow up by phone, text, or email about this position.";

export function extractRecruitingLeadFirstName(fullName: string | null | undefined): string | null {
  const full = (fullName ?? "").trim();
  if (!full) return null;
  const word = full.split(/\s+/).filter(Boolean)[0];
  return word ? word.slice(0, 80) : null;
}

export function buildFacebookRecruitingLeadIntroSmsBody(firstName: string | null | undefined): string {
  const name = typeof firstName === "string" ? firstName.trim() : "";
  const greeting = name ? `Hi ${name}` : "Hi";
  return `${greeting}, thanks for reaching out to Saintly Home Health about Physical Therapy visit opportunities. We received your info and our team will contact you soon. You can also call/text us at ${FACEBOOK_RECRUITING_INTRO_SMS_CALLBACK_PHONE}. Reply STOP to opt out.`;
}

export function shouldSendFacebookRecruitingIntroSms(input: {
  created: boolean;
  hasPhone: boolean;
  autoSmsSentAt: string | null | undefined;
}): boolean {
  return input.created && input.hasPhone && !input.autoSmsSentAt;
}

export function shouldSendFacebookRecruitingAdminNotification(input: {
  created: boolean;
  lastAdminNotificationSentAt: string | null | undefined;
}): boolean {
  return input.created && !input.lastAdminNotificationSentAt;
}

export function buildFacebookRecruitingLeadAdminNotificationBody(input: {
  fullName: string;
  coverageArea?: string | null;
  visitsPerWeek?: string | null;
  startDate?: string | null;
}): string {
  const name = input.fullName.trim() || "Applicant";
  const parts = [
    input.coverageArea?.trim() || null,
    input.visitsPerWeek?.trim() || null,
    input.startDate?.trim() ? `Start: ${input.startDate.trim()}` : null,
  ].filter(Boolean);
  const suffix = parts.length ? ` ${parts.join(" • ")}` : "";
  const line = `${name} submitted a Facebook PT hiring form.${suffix}`;
  return line.length > 240 ? `${line.slice(0, 239)}…` : line;
}

export function recruitingLeadAdminNotificationHref(leadId: string): string {
  return `/admin/recruiting-leads/${leadId.trim()}`;
}

export function recruitingLeadAdminNotificationDedupeKey(leadId: string): string {
  return `facebook_recruiting_lead:${leadId.trim()}`;
}
