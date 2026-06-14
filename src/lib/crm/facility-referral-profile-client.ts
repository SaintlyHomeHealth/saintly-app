import type { ReferralProfileUpdateFromActivityPrompt } from "@/lib/crm/facility-referral-profile-types";

/** Client-safe extraction for profile update prompts after Quick Log / AI Capture. */
export function extractReferralProcessHintFromNotes(notes: string): ReferralProfileUpdateFromActivityPrompt | null {
  const text = notes.trim();
  if (text.length < 15) return null;
  if (!/referral|fax|intake|orders|send to|attention/i.test(text)) return null;

  const faxMatch = text.match(/(?:fax|f\.?\s*ax)\s*(?:to|:)?\s*([\d\-().\s]{10,})/i);
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const phoneMatch = text.match(/(?:call|phone|tel)\s*(?:at|:)?\s*([\d\-().\s]{10,})/i);

  let preferred: string | null = null;
  if (/fax/i.test(text)) preferred = "fax";
  else if (/email/i.test(text)) preferred = "email";
  else if (/portal/i.test(text)) preferred = "portal";
  else if (/phone|call/i.test(text)) preferred = "phone";

  const nameMatch = text.match(/(?:ask for|speak with|talk to|contact|maria|lisa)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);

  return {
    referral_process: text.slice(0, 500),
    preferred_referral_method: preferred,
    best_contact_name: nameMatch?.[1] ?? null,
    referral_fax: faxMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
    referral_email: emailMatch?.[0] ?? null,
    referral_phone: phoneMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
  };
}
