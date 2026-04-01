import type { PhoneCallRow } from "../recent-calls-live";

export type CrmMetadataSlice = {
  type: string;
  outcome: string;
  tags: string;
  note: string;
};

/** Reads `phone_calls.metadata.crm` saved by the CRM drawer. */
export function readCrmMetadata(row: PhoneCallRow | null): CrmMetadataSlice {
  const empty: CrmMetadataSlice = { type: "", outcome: "", tags: "", note: "" };
  if (!row?.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) {
    return empty;
  }
  const crm = (row.metadata as Record<string, unknown>).crm;
  if (!crm || typeof crm !== "object" || Array.isArray(crm)) {
    return empty;
  }
  const c = crm as Record<string, unknown>;
  return {
    type: typeof c.type === "string" ? c.type : "",
    outcome: typeof c.outcome === "string" ? c.outcome : "",
    tags: typeof c.tags === "string" ? c.tags : "",
    note: typeof c.note === "string" ? c.note : "",
  };
}

export function formatCrmTypeLabel(type: string): string | null {
  const t = type.trim().toLowerCase();
  if (!t) return null;
  const map: Record<string, string> = {
    patient: "Patient",
    caregiver: "Caregiver",
    referral: "Referral",
    spam: "Spam",
  };
  return map[t] ?? null;
}

export function formatCrmOutcomeLabel(outcome: string): string | null {
  const o = outcome.trim();
  if (!o) return null;
  const map: Record<string, string> = {
    booked_assessment: "Booked assessment",
    needs_followup: "Needs follow-up",
    not_qualified: "Not qualified",
    wrong_number: "Wrong number",
  };
  return map[o] ?? null;
}

export function isSpamClassification(row: PhoneCallRow): boolean {
  if (readCrmMetadata(row).type.trim().toLowerCase() === "spam") return true;
  return row.primary_tag?.trim().toLowerCase() === "spam";
}

export function isNeedsFollowUpClassification(row: PhoneCallRow): boolean {
  return readCrmMetadata(row).outcome.trim() === "needs_followup";
}
