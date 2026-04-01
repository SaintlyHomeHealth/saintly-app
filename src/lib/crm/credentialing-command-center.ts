import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
  type ContractingStatusValue,
  type CredentialingStatusValue,
} from "@/lib/crm/credentialing-status-options";
import { summarizePayerDocuments } from "@/lib/crm/credentialing-documents";

export type CredentialingBadgeTone = "green" | "yellow" | "red" | "gray";

const BADGE_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums";

export function credentialingBadgeTone(status: string): CredentialingBadgeTone {
  switch (status) {
    case "enrolled":
      return "green";
    case "in_progress":
    case "submitted":
      return "yellow";
    case "stalled":
      return "red";
    case "not_started":
    default:
      return "gray";
  }
}

export function contractingBadgeTone(status: string): CredentialingBadgeTone {
  switch (status) {
    case "contracted":
      return "green";
    case "in_contracting":
      return "yellow";
    case "stalled":
      return "red";
    case "not_started":
    case "pending":
    default:
      return "gray";
  }
}

export function credentialingBadgeClass(tone: CredentialingBadgeTone): string {
  switch (tone) {
    case "green":
      return `${BADGE_BASE} border-green-200 bg-green-50 text-green-800`;
    case "yellow":
      return `${BADGE_BASE} border-amber-200 bg-amber-50 text-amber-900`;
    case "red":
      return `${BADGE_BASE} border-red-200 bg-red-50 text-red-800`;
    case "gray":
      return `${BADGE_BASE} border-slate-200 bg-slate-100 text-slate-600`;
  }
}

export function payerCredentialingFullyComplete(credentialingStatus: string, contractingStatus: string): boolean {
  return credentialingStatus === "enrolled" && contractingStatus === "contracted";
}

/** Days without follow-up before in-progress / submitted / in-contracting rows are flagged. */
export const CREDENTIALING_FOLLOW_UP_STALE_DAYS = 14;

/**
 * NEEDS ATTENTION — deterministic rules (source of truth for ops):
 *
 * 1) STALLED — credentialing_status = 'stalled' OR contracting_status = 'stalled'
 *
 * 2) STALE FOLLOW-UP — Row is not fully complete (not both enrolled + contracted).
 *    Neither side is stalled. Work is in credentialing in_progress or submitted,
 *    OR contracting is in_contracting. Then: last_follow_up_at is null OR older than
 *    CREDENTIALING_FOLLOW_UP_STALE_DAYS (14) days.
 *
 * 3) MISSING CONTACT — Row is not in the “queue” state (not_started + pending/not_started only).
 *    Not fully complete. No portal URL AND no primary phone AND no primary email.
 *
 * 4) MISSING DOCUMENTS — Same queue/complete logic as (3). At least one payer_credentialing_documents
 *    row has status = 'missing'. If no document rows are loaded (legacy), this rule does not fire.
 *
 * 5) UNASSIGNED OWNER — Same queue/complete logic as (3). assigned_owner_user_id is null.
 *
 * “Queue” (excluded from 3–5): credentialing not_started AND contracting in (not_started, pending).
 * Fully complete rows are excluded from 2–5.
 */
export type CredentialingAttentionReason =
  | "stalled"
  | "stale_follow_up"
  | "missing_contact_info"
  | "missing_documents"
  | "unassigned_owner";

export type PayerCredentialingDocumentStub = {
  status: string;
};

export type PayerCredentialingListRow = {
  id: string;
  payer_name: string;
  payer_type: string | null;
  market_state: string | null;
  credentialing_status: string;
  contracting_status: string;
  portal_url: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
  notes: string | null;
  last_follow_up_at: string | null;
  updated_at: string;
  assigned_owner_user_id: string | null;
  /** From nested select; empty if migration not applied yet */
  payer_credentialing_documents?: PayerCredentialingDocumentStub[] | null;
};

function msDaysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

export function isPayerCredentialingQueueOnly(r: PayerCredentialingListRow): boolean {
  return (
    r.credentialing_status === "not_started" &&
    (r.contracting_status === "not_started" || r.contracting_status === "pending")
  );
}

function isStalledRow(r: PayerCredentialingListRow): boolean {
  return r.credentialing_status === "stalled" || r.contracting_status === "stalled";
}

/** Credentialing in_progress/submitted or contracting actively in_contracting (for stale follow-up). */
function isTightFollowUpLane(r: PayerCredentialingListRow): boolean {
  return (
    r.credentialing_status === "in_progress" ||
    r.credentialing_status === "submitted" ||
    r.contracting_status === "in_contracting"
  );
}

function hasAnyContactOrPortal(r: PayerCredentialingListRow): boolean {
  const portal = (r.portal_url ?? "").trim();
  const phone = (r.primary_contact_phone ?? "").trim();
  const email = (r.primary_contact_email ?? "").trim();
  return Boolean(portal || phone || email);
}

function getDocList(r: PayerCredentialingListRow): PayerCredentialingDocumentStub[] {
  const raw = r.payer_credentialing_documents;
  if (!raw || !Array.isArray(raw)) return [];
  return raw;
}

export function payerCredentialingFollowUpIsStale(r: PayerCredentialingListRow): boolean {
  if (payerCredentialingFullyComplete(r.credentialing_status, r.contracting_status)) return false;
  if (isStalledRow(r)) return false;
  if (!isTightFollowUpLane(r)) return false;
  const days = msDaysSince(r.last_follow_up_at);
  return days === null || days > CREDENTIALING_FOLLOW_UP_STALE_DAYS;
}

export function analyzePayerCredentialingAttention(r: PayerCredentialingListRow): {
  needsAttention: boolean;
  reasons: CredentialingAttentionReason[];
} {
  const reasons: CredentialingAttentionReason[] = [];

  if (isStalledRow(r)) {
    reasons.push("stalled");
  }

  if (payerCredentialingFollowUpIsStale(r)) {
    reasons.push("stale_follow_up");
  }

  const complete = payerCredentialingFullyComplete(r.credentialing_status, r.contracting_status);
  const queue = isPayerCredentialingQueueOnly(r);

  if (!complete && !queue) {
    if (!hasAnyContactOrPortal(r)) {
      reasons.push("missing_contact_info");
    }
    const docs = getDocList(r);
    if (docs.length > 0 && summarizePayerDocuments(docs).hasMissing) {
      reasons.push("missing_documents");
    }
    if (!r.assigned_owner_user_id?.trim()) {
      reasons.push("unassigned_owner");
    }
  }

  return { needsAttention: reasons.length > 0, reasons };
}

export const CREDENTIALING_ATTENTION_REASON_LABELS: Record<CredentialingAttentionReason, string> = {
  stalled: "Stalled",
  stale_follow_up: "Stale follow-up (14+ days)",
  missing_contact_info: "Missing portal / contact",
  missing_documents: "Documents missing",
  unassigned_owner: "No assigned owner",
};

export function computeCredentialingSummaryStats(rows: PayerCredentialingListRow[]): {
  total: number;
  inProgress: number;
  submitted: number;
  enrolled: number;
  contracted: number;
  stalled: number;
  needsAttention: number;
  docsMissing: number;
} {
  let inProgress = 0;
  let submitted = 0;
  let enrolled = 0;
  let contracted = 0;
  let stalled = 0;
  let needsAttention = 0;
  let docsMissing = 0;

  for (const r of rows) {
    if (r.credentialing_status === "in_progress") inProgress += 1;
    if (r.credentialing_status === "submitted") submitted += 1;
    if (r.credentialing_status === "enrolled") enrolled += 1;
    if (r.contracting_status === "contracted") contracted += 1;
    if (r.credentialing_status === "stalled" || r.contracting_status === "stalled") stalled += 1;
    if (analyzePayerCredentialingAttention(r).needsAttention) needsAttention += 1;
    const docs = getDocList(r);
    if (docs.length > 0 && summarizePayerDocuments(docs).hasMissing) docsMissing += 1;
  }

  return {
    total: rows.length,
    inProgress,
    submitted,
    enrolled,
    contracted,
    stalled,
    needsAttention,
    docsMissing,
  };
}

export function credentialingStatusLabel(status: string): string {
  if ((CREDENTIALING_STATUS_VALUES as readonly string[]).includes(status)) {
    return CREDENTIALING_STATUS_LABELS[status as CredentialingStatusValue];
  }
  return status;
}

export function contractingStatusLabel(status: string): string {
  if ((CONTRACTING_STATUS_VALUES as readonly string[]).includes(status)) {
    return CONTRACTING_STATUS_LABELS[status as ContractingStatusValue];
  }
  return status;
}
