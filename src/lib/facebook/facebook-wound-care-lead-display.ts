/**
 * Parse wound-care Facebook Lead Ads answers for CRM list + detail UI.
 */

import { parseLeadIntakeRequestFromMetadata } from "@/lib/crm/lead-intake-request";
import { DEFAULT_FACEBOOK_WOUND_CARE_SOURCE } from "@/lib/facebook/facebook-partner-lead-normalize";

export type FacebookWoundCareLeadAnswers = {
  insurance: string;
  woundCareNeeded: string;
  careFor: string;
  source: string;
  city: string;
};

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

function fromIntakeDetails(meta: unknown): FacebookWoundCareLeadAnswers | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  const details = m.intake_details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;

  const insurance =
    readMetaString(d, "insurance_answer") ||
    readMetaString(d, "has_medicare") ||
    readMetaString(d, "medicare");
  const woundCareNeeded =
    readMetaString(d, "wound_care_needed") || readMetaString(d, "wound_type");
  const careFor = readMetaString(d, "care_for");
  const source =
    readMetaString(d, "partner_source") ||
    readMetaString(d, "referral_source") ||
    DEFAULT_FACEBOOK_WOUND_CARE_SOURCE;
  const city = readMetaString(d, "city");

  if (!insurance && !woundCareNeeded && !careFor) return null;

  return {
    insurance,
    woundCareNeeded,
    careFor,
    source,
    city,
  };
}

function parseNotesBlock(notes: string | null | undefined): FacebookWoundCareLeadAnswers | null {
  const text = (notes ?? "").trim();
  if (!text.includes("Facebook Wound Care Lead")) return null;

  const line = (label: string): string => {
    const re = new RegExp(`^${label}:\\s*(.+)$`, "im");
    const hit = text.match(re);
    return hit?.[1]?.trim() ?? "";
  };

  const insurance = line("Insurance");
  const woundCareNeeded = line("Wound care needed");
  const careFor = line("Care for");
  const source = line("Source") || DEFAULT_FACEBOOK_WOUND_CARE_SOURCE;

  if (!insurance && !woundCareNeeded && !careFor) return null;

  return { insurance, woundCareNeeded, careFor, source, city: "" };
}

export function parseFacebookWoundCareLeadAnswers(input: {
  source?: string | null;
  notes?: string | null;
  external_source_metadata?: unknown;
  referral_source?: string | null;
  payer_name?: string | null;
  contact_city?: string | null;
}): FacebookWoundCareLeadAnswers | null {
  const src = (input.source ?? "").trim();
  if (src !== "facebook_lead_ads" && src !== "facebook" && src !== "facebook_ads") {
    const fromMetaOnly = fromIntakeDetails(input.external_source_metadata);
    if (!fromMetaOnly) return null;
  }

  const fromDetails = fromIntakeDetails(input.external_source_metadata);
  if (fromDetails) {
    return {
      ...fromDetails,
      city: fromDetails.city || (input.contact_city ?? "").trim(),
      insurance: fromDetails.insurance || (input.payer_name ?? "").trim(),
      source: fromDetails.source || (input.referral_source ?? "").trim() || DEFAULT_FACEBOOK_WOUND_CARE_SOURCE,
    };
  }

  const fromNotes = parseNotesBlock(input.notes);
  if (fromNotes) {
    return {
      ...fromNotes,
      city: (input.contact_city ?? "").trim(),
      insurance: fromNotes.insurance || (input.payer_name ?? "").trim(),
      source: fromNotes.source || (input.referral_source ?? "").trim() || DEFAULT_FACEBOOK_WOUND_CARE_SOURCE,
    };
  }

  const intake = parseLeadIntakeRequestFromMetadata(input.external_source_metadata);
  const insurance =
    intake.insurance_answer.trim() ||
    (input.payer_name ?? "").trim();
  const woundCareNeeded = intake.wound_type.trim() || intake.situation.trim();
  const careFor = intake.care_for.trim();

  if (!insurance && !woundCareNeeded && !careFor) return null;

  return {
    insurance,
    woundCareNeeded,
    careFor,
    source: (input.referral_source ?? "").trim() || DEFAULT_FACEBOOK_WOUND_CARE_SOURCE,
    city: (input.contact_city ?? "").trim(),
  };
}

export function facebookWoundCareAnswersSummary(answers: FacebookWoundCareLeadAnswers): string {
  const parts = [
    answers.insurance ? `Insurance: ${answers.insurance}` : null,
    answers.woundCareNeeded ? `Wound: ${answers.woundCareNeeded}` : null,
    answers.careFor ? `Care for: ${answers.careFor}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
