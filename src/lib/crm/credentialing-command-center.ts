import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
  type ContractingStatusValue,
  type CredentialingStatusValue,
} from "@/lib/crm/credentialing-status-options";
import { summarizePayerDocuments } from "@/lib/crm/credentialing-documents";
import { formatCredentialingDueDateLabel as formatCredentialingDueDateLabelFromTz } from "@/lib/crm/credentialing-datetime";

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

/** Ready to bill / revenue-ready: both enrollment and contracting complete. */
export function payerCredentialingReadyToBill(credentialingStatus: string, contractingStatus: string): boolean {
  return payerCredentialingFullyComplete(credentialingStatus, contractingStatus);
}

/**
 * Days without follow-up in the active lane before Needs attention (strict ops cadence).
 */
export const CREDENTIALING_FOLLOW_UP_STALE_DAYS = 7;

export const CREDENTIALING_SUBMITTED_STAGNANT_DAYS = 21;

export const CREDENTIALING_QUEUE_IDLE_DAYS = 30;

/**
 * NEEDS ATTENTION — deterministic rules (revenue / execution blocking):
 *
 * 1) STALLED — explicit credentialing_status or contracting_status = 'stalled'
 *
 * 2) STALE FOLLOW-UP — Not ready-to-bill; not explicitly stalled; in active lane
 *    (in_progress, submitted, or in_contracting); last_follow_up_at null or older than
 *    CREDENTIALING_FOLLOW_UP_STALE_DAYS (7).
 *
 * 3) SUBMITTED STAGNANT — credentialing = submitted; not stalled; not ready-to-bill;
 *    record updated_at older than CREDENTIALING_SUBMITTED_STAGNANT_DAYS (21) (no movement).
 *
 * 4) QUEUE IDLE — “Queue only” (not_started + pending/not_started contracting) AND
 *    created_at older than CREDENTIALING_QUEUE_IDLE_DAYS (30).
 *
 * 5) NO REACHABLE CONTACT — Not ready-to-bill; not queue-only; no primary phone AND no email
 *    (cannot call or email the payer — portal alone is not enough).
 *
 * 6) MISSING DOCUMENTS — Same as (5) scope; checklist rows exist and any status = missing.
 *
 * 7) UNASSIGNED OWNER — Same as (5); assigned_owner_user_id null.
 */
export type CredentialingAttentionReason =
  | "stalled"
  | "stale_follow_up"
  | "submitted_stagnant"
  | "queue_idle"
  | "no_reachable_contact"
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
  primary_contact_phone_direct?: string | null;
  primary_contact_fax?: string | null;
  primary_contact_email: string | null;
  /** From nested select; used for reachability + search */
  payer_credentialing_record_emails?: { email: string }[] | null;
  notes: string | null;
  last_follow_up_at: string | null;
  updated_at: string;
  created_at: string;
  assigned_owner_user_id: string | null;
  next_action: string | null;
  next_action_due_date: string | null;
  priority: string;
  /** From nested select; empty if migration not applied yet */
  payer_credentialing_documents?: PayerCredentialingDocumentStub[] | null;
};

function msDaysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

/** Relative labels use the same display timezone as `credentialing-datetime` (Pacific). */
export function formatCredentialingDueDateLabel(isoDate: string | null): string {
  return formatCredentialingDueDateLabelFromTz(isoDate);
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

function isTightFollowUpLane(r: PayerCredentialingListRow): boolean {
  return (
    r.credentialing_status === "in_progress" ||
    r.credentialing_status === "submitted" ||
    r.contracting_status === "in_contracting"
  );
}

export function hasReachableContact(r: PayerCredentialingListRow): boolean {
  const phones = [
    r.primary_contact_phone,
    r.primary_contact_phone_direct,
    r.primary_contact_fax,
  ];
  if (phones.some((p) => (p ?? "").trim())) return true;
  const legacyEmail = (r.primary_contact_email ?? "").trim();
  if (legacyEmail) return true;
  const extras = r.payer_credentialing_record_emails;
  if (extras && extras.length > 0) {
    return extras.some((e) => (e.email ?? "").trim());
  }
  return false;
}

function getDocList(r: PayerCredentialingListRow): PayerCredentialingDocumentStub[] {
  const raw = r.payer_credentialing_documents;
  if (!raw || !Array.isArray(raw)) return [];
  return raw;
}

export function payerCredentialingFollowUpIsStale(r: PayerCredentialingListRow): boolean {
  if (payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status)) return false;
  if (isStalledRow(r)) return false;
  if (!isTightFollowUpLane(r)) return false;
  const days = msDaysSince(r.last_follow_up_at);
  return days === null || days > CREDENTIALING_FOLLOW_UP_STALE_DAYS;
}

function isSubmittedStagnant(r: PayerCredentialingListRow): boolean {
  if (r.credentialing_status !== "submitted") return false;
  if (isStalledRow(r)) return false;
  if (payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status)) return false;
  const days = msDaysSince(r.updated_at);
  return days !== null && days > CREDENTIALING_SUBMITTED_STAGNANT_DAYS;
}

function isQueueIdleTooLong(r: PayerCredentialingListRow): boolean {
  if (!isPayerCredentialingQueueOnly(r)) return false;
  const days = msDaysSince(r.created_at);
  return days !== null && days > CREDENTIALING_QUEUE_IDLE_DAYS;
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

  if (isSubmittedStagnant(r)) {
    reasons.push("submitted_stagnant");
  }

  if (isQueueIdleTooLong(r)) {
    reasons.push("queue_idle");
  }

  const complete = payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status);
  const queue = isPayerCredentialingQueueOnly(r);

  if (!complete && !queue) {
    if (!hasReachableContact(r)) {
      reasons.push("no_reachable_contact");
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
  stalled: "Stalled (explicit)",
  stale_follow_up: `No follow-up (${CREDENTIALING_FOLLOW_UP_STALE_DAYS}+ days)`,
  submitted_stagnant: `Submitted, no update (${CREDENTIALING_SUBMITTED_STAGNANT_DAYS}+ days)`,
  queue_idle: `In queue ${CREDENTIALING_QUEUE_IDLE_DAYS}+ days`,
  no_reachable_contact: "No phone / email",
  missing_documents: "Checklist docs missing",
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
  readyToBill: number;
  highPriority: number;
} {
  let inProgress = 0;
  let submitted = 0;
  let enrolled = 0;
  let contracted = 0;
  let stalled = 0;
  let needsAttention = 0;
  let docsMissing = 0;
  let readyToBill = 0;
  let highPriority = 0;

  for (const r of rows) {
    if (r.credentialing_status === "in_progress") inProgress += 1;
    if (r.credentialing_status === "submitted") submitted += 1;
    if (r.credentialing_status === "enrolled") enrolled += 1;
    if (r.contracting_status === "contracted") contracted += 1;
    if (r.credentialing_status === "stalled" || r.contracting_status === "stalled") stalled += 1;
    if (analyzePayerCredentialingAttention(r).needsAttention) needsAttention += 1;
    const docs = getDocList(r);
    if (docs.length > 0 && summarizePayerDocuments(docs).hasMissing) docsMissing += 1;
    if (payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status)) readyToBill += 1;
    if ((r.priority ?? "medium").toLowerCase() === "high") highPriority += 1;
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
    readyToBill,
    highPriority,
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
