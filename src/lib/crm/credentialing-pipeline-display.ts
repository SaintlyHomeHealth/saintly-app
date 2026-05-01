import {
  analyzePayerCredentialingAttention,
  getCredentialingChecklistDocStubs,
  payerCredentialingReadyToBill,
  type CredentialingAttentionReason,
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import { summarizePayerDocuments } from "@/lib/crm/credentialing-documents";

/** Single scan-friendly stage for lists and headers (derived; DB fields unchanged). */
export type CredentialingPipelineStage =
  | "not_started"
  | "gathering_docs"
  | "submitted"
  | "in_review"
  | "contract_received"
  | "active"
  | "denied"
  | "stalled";

export const CREDENTIALING_PIPELINE_STAGE_LABELS: Record<CredentialingPipelineStage, string> = {
  not_started: "Not started",
  gathering_docs: "Gathering docs",
  submitted: "Submitted",
  in_review: "In review",
  contract_received: "Contract received",
  active: "Active",
  denied: "Denied",
  stalled: "Stalled",
};

/** One blocker badge for triage (derived). */
export type CredentialingPipelineBlocker =
  | "waiting_on_us"
  | "waiting_on_payer"
  | "blocked"
  | "complete"
  | "denied";

export const CREDENTIALING_PIPELINE_BLOCKER_LABELS: Record<CredentialingPipelineBlocker, string> = {
  waiting_on_us: "Waiting on us",
  waiting_on_payer: "Waiting on payer",
  blocked: "Blocked",
  complete: "Complete",
  denied: "Denied",
};

/** True when there is real operational work on the file (vs default in_progress queue). */
export function credentialingPipelineWorkHasBegun(r: PayerCredentialingListRow): boolean {
  if ((r.last_follow_up_at ?? "").trim()) return true;

  const docs = getCredentialingChecklistDocStubs(r);
  if (docs.length > 0) {
    const sum = summarizePayerDocuments(docs);
    if (sum.total > 0 && sum.missing < sum.total) return true;
    if (sum.hasMissing && credentialingMeaningfulNextAction(r.next_action)) return true;
  } else if (credentialingMeaningfulNextAction(r.next_action)) {
    return true;
  }

  return credentialingMeaningfulNextAction(r.next_action);
}

const PLACEHOLDER_NEXT_ACTIONS = new Set([
  "tbd",
  "todo",
  "n/a",
  "na",
  "none",
  "pending",
  "—",
  "-",
  "...",
]);

/** Non-empty next step that is not a placeholder (sync with dashboard bucket logic). */
export function credentialingMeaningfulNextAction(next_action: string | null | undefined): boolean {
  const t = (next_action ?? "").trim();
  if (t.length < 4) return false;
  const lower = t.toLowerCase();
  if (PLACEHOLDER_NEXT_ACTIONS.has(lower)) return false;
  return true;
}

export function computeCredentialingPipelineStage(r: PayerCredentialingListRow): CredentialingPipelineStage {
  const cred = (r.credentialing_status ?? "").trim();
  const cont = (r.contracting_status ?? "").trim();

  if (cred === "denied") return "denied";

  if (cred === "stalled" || cont === "stalled") return "stalled";

  if (payerCredentialingReadyToBill(cred, cont)) return "active";

  if (cont === "contracted" && cred !== "enrolled") return "contract_received";

  if (cred === "enrolled" && (cont === "pending" || cont === "in_contracting" || cont === "not_started")) {
    return "in_review";
  }

  if (cred === "submitted") return "submitted";

  // Queue-only: still "Not started" until real work signals (matches summary cards).
  if (cred === "not_started") return "not_started";

  // Default in_progress without follow-up / docs / next step counts as Not started for display.
  if (cred === "in_progress" && !credentialingPipelineWorkHasBegun(r)) return "not_started";

  const docs = getCredentialingChecklistDocStubs(r);
  if (docs.length > 0 && summarizePayerDocuments(docs).hasMissing) {
    return "gathering_docs";
  }

  if (cred === "in_progress") return "gathering_docs";

  return "gathering_docs";
}

export function computeCredentialingPipelineBlocker(
  r: PayerCredentialingListRow,
  attention = analyzePayerCredentialingAttention(r)
): CredentialingPipelineBlocker {
  if (payerCredentialingReadyToBill(r.credentialing_status, r.contracting_status)) return "complete";

  if (r.credentialing_status === "denied") return "denied";

  if (r.credentialing_status === "stalled" || r.contracting_status === "stalled") return "blocked";

  if (!attention.needsAttention) {
    const cred = (r.credentialing_status ?? "").trim();
    const cont = (r.contracting_status ?? "").trim();
    if (cred === "submitted" || (cred === "enrolled" && (cont === "pending" || cont === "in_contracting"))) {
      return "waiting_on_payer";
    }
    return "waiting_on_us";
  }

  const reasons = new Set(attention.reasons);
  if (reasons.has("stalled")) return "blocked";

  const waitingOnUsReasons: CredentialingAttentionReason[] = [
    "missing_documents",
    "unassigned_owner",
    "stale_follow_up",
    "no_reachable_contact",
    "queue_idle",
  ];
  if (waitingOnUsReasons.some((x) => reasons.has(x))) return "waiting_on_us";

  if (reasons.has("submitted_stagnant")) return "waiting_on_payer";

  return "waiting_on_us";
}

export type CredentialingSummaryBucket =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "active"
  | "blocked"
  | "denied";

const CREDENTIALING_SUMMARY_BUCKETS: readonly CredentialingSummaryBucket[] = [
  "not_started",
  "in_progress",
  "submitted",
  "active",
  "blocked",
  "denied",
] as const;

export function isCredentialingSummaryBucket(v: string): v is CredentialingSummaryBucket {
  return (CREDENTIALING_SUMMARY_BUCKETS as readonly string[]).includes(v);
}

/** One summary bucket per row (cards are mutually exclusive). */
export function getCredentialingSummaryBucketForRow(r: PayerCredentialingListRow): CredentialingSummaryBucket {
  const stage = computeCredentialingPipelineStage(r);
  const blocker = computeCredentialingPipelineBlocker(r);
  if (stage === "denied" || blocker === "denied") return "denied";
  if (stage === "stalled" || blocker === "blocked") return "blocked";
  if (stage === "active") return "active";
  if (stage === "not_started") return "not_started";
  if (stage === "submitted") return "submitted";
  return "in_progress";
}

export function matchesCredentialingSummaryBucket(
  r: PayerCredentialingListRow,
  bucket: CredentialingSummaryBucket
): boolean {
  return getCredentialingSummaryBucketForRow(r) === bucket;
}

export function computeCredentialingSummaryBuckets(rows: PayerCredentialingListRow[]): Record<
  CredentialingSummaryBucket,
  number
> {
  const out: Record<CredentialingSummaryBucket, number> = {
    not_started: 0,
    in_progress: 0,
    submitted: 0,
    active: 0,
    blocked: 0,
    denied: 0,
  };
  for (const r of rows) {
    out[getCredentialingSummaryBucketForRow(r)] += 1;
  }
  return out;
}

const STAGE_BADGE_BASE =
  "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums";

export function credentialingPipelineStageBadgeClass(stage: CredentialingPipelineStage): string {
  switch (stage) {
    case "active":
      return `${STAGE_BADGE_BASE} border-emerald-200/90 bg-emerald-50 text-emerald-900`;
    case "denied":
      return `${STAGE_BADGE_BASE} border-red-300/90 bg-red-50 text-red-950`;
    case "stalled":
      return `${STAGE_BADGE_BASE} border-rose-200/90 bg-rose-50 text-rose-900`;
    case "submitted":
      return `${STAGE_BADGE_BASE} border-sky-200/90 bg-sky-50 text-sky-950`;
    case "in_review":
    case "contract_received":
      return `${STAGE_BADGE_BASE} border-violet-200/90 bg-violet-50 text-violet-950`;
    case "gathering_docs":
      return `${STAGE_BADGE_BASE} border-amber-200/90 bg-amber-50 text-amber-950`;
    case "not_started":
    default:
      return `${STAGE_BADGE_BASE} border-slate-200/90 bg-slate-50 text-slate-700`;
  }
}

const BLOCKER_BADGE_BASE =
  "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold";

export function credentialingPipelineBlockerBadgeClass(blocker: CredentialingPipelineBlocker): string {
  switch (blocker) {
    case "complete":
      return `${BLOCKER_BADGE_BASE} border-emerald-200/90 bg-emerald-50/90 text-emerald-900`;
    case "denied":
      return `${BLOCKER_BADGE_BASE} border-red-300/90 bg-red-50 text-red-950`;
    case "blocked":
      return `${BLOCKER_BADGE_BASE} border-slate-800/15 bg-slate-900 text-white`;
    case "waiting_on_payer":
      return `${BLOCKER_BADGE_BASE} border-slate-200/90 bg-white text-slate-700`;
    case "waiting_on_us":
    default:
      return `${BLOCKER_BADGE_BASE} border-amber-200/90 bg-amber-50 text-amber-950`;
  }
}
