import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
  type ContractingStatusValue,
  type CredentialingStatusValue,
} from "@/lib/crm/credentialing-status-options";

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

/** Days without follow-up before an active pipeline row is flagged. */
export const CREDENTIALING_FOLLOW_UP_STALE_DAYS = 14;

export type CredentialingAttentionReason = "stalled" | "stale_follow_up" | "missing_contact_info";

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
};

function msDaysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function isInActivePipeline(r: PayerCredentialingListRow): boolean {
  const c = r.credentialing_status;
  const t = r.contracting_status;
  return (
    c === "in_progress" ||
    c === "submitted" ||
    c === "stalled" ||
    t === "in_contracting" ||
    t === "stalled"
  );
}

function hasAnyContactOrPortal(r: PayerCredentialingListRow): boolean {
  const portal = (r.portal_url ?? "").trim();
  const phone = (r.primary_contact_phone ?? "").trim();
  const email = (r.primary_contact_email ?? "").trim();
  return Boolean(portal || phone || email);
}

export function analyzePayerCredentialingAttention(r: PayerCredentialingListRow): {
  needsAttention: boolean;
  reasons: CredentialingAttentionReason[];
} {
  const reasons: CredentialingAttentionReason[] = [];
  const complete = payerCredentialingFullyComplete(r.credentialing_status, r.contracting_status);

  if (r.credentialing_status === "stalled" || r.contracting_status === "stalled") {
    reasons.push("stalled");
  }

  if (!complete && isInActivePipeline(r)) {
    const days = msDaysSince(r.last_follow_up_at);
    if (days === null || days > CREDENTIALING_FOLLOW_UP_STALE_DAYS) {
      reasons.push("stale_follow_up");
    }
  }

  if (!complete && isInActivePipeline(r) && !hasAnyContactOrPortal(r)) {
    reasons.push("missing_contact_info");
  }

  return { needsAttention: reasons.length > 0, reasons };
}

export const CREDENTIALING_ATTENTION_REASON_LABELS: Record<CredentialingAttentionReason, string> = {
  stalled: "Stalled",
  stale_follow_up: "Stale follow-up",
  missing_contact_info: "Missing portal / contact",
};

export function computeCredentialingSummaryStats(rows: PayerCredentialingListRow[]): {
  total: number;
  inProgress: number;
  submitted: number;
  enrolled: number;
  contracted: number;
  stalled: number;
  needsAttention: number;
} {
  let inProgress = 0;
  let submitted = 0;
  let enrolled = 0;
  let contracted = 0;
  let stalled = 0;
  let needsAttention = 0;

  for (const r of rows) {
    if (r.credentialing_status === "in_progress") inProgress += 1;
    if (r.credentialing_status === "submitted") submitted += 1;
    if (r.credentialing_status === "enrolled") enrolled += 1;
    if (r.contracting_status === "contracted") contracted += 1;
    if (r.credentialing_status === "stalled" || r.contracting_status === "stalled") stalled += 1;
    if (analyzePayerCredentialingAttention(r).needsAttention) needsAttention += 1;
  }

  return {
    total: rows.length,
    inProgress,
    submitted,
    enrolled,
    contracted,
    stalled,
    needsAttention,
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
