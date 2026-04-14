/** DB check: payer_credentialing_records.credentialing_status */
export const CREDENTIALING_STATUS_VALUES = [
  "not_started",
  "in_progress",
  "submitted",
  "enrolled",
  "stalled",
  "denied",
] as const;

export type CredentialingStatusValue = (typeof CREDENTIALING_STATUS_VALUES)[number];

export const CREDENTIALING_STATUS_LABELS: Record<CredentialingStatusValue, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  enrolled: "Enrolled",
  stalled: "Stalled / needs follow-up",
  denied: "Denied",
};

/** DB check: payer_credentialing_records.contracting_status */
export const CONTRACTING_STATUS_VALUES = [
  "not_started",
  "pending",
  "in_contracting",
  "contracted",
  "stalled",
] as const;

export type ContractingStatusValue = (typeof CONTRACTING_STATUS_VALUES)[number];

export const CONTRACTING_STATUS_LABELS: Record<ContractingStatusValue, string> = {
  not_started: "Not started",
  pending: "Pending",
  in_contracting: "In contracting",
  contracted: "Contracted",
  stalled: "Stalled / needs follow-up",
};

export function isCredentialingStatus(v: string): v is CredentialingStatusValue {
  return (CREDENTIALING_STATUS_VALUES as readonly string[]).includes(v);
}

export function isContractingStatus(v: string): v is ContractingStatusValue {
  return (CONTRACTING_STATUS_VALUES as readonly string[]).includes(v);
}

export const CREDENTIALING_PRIORITY_VALUES = ["high", "medium", "low"] as const;

export type CredentialingPriorityValue = (typeof CREDENTIALING_PRIORITY_VALUES)[number];

export const CREDENTIALING_PRIORITY_LABELS: Record<CredentialingPriorityValue, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function isCredentialingPriority(v: string): v is CredentialingPriorityValue {
  return (CREDENTIALING_PRIORITY_VALUES as readonly string[]).includes(v);
}

/** List page filter segment (query `segment`). */
export type CredentialingListSegment =
  | "all"
  | "in_progress"
  | "submitted"
  | "enrolled"
  | "contracted"
  | "stalled"
  | "denied"
  | "needs_attention"
  | "docs_missing"
  | "ready_to_bill";

export const CREDENTIALING_LIST_SEGMENTS: { value: CredentialingListSegment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "enrolled", label: "Enrolled" },
  { value: "contracted", label: "Contracted" },
  { value: "stalled", label: "Stalled" },
  { value: "denied", label: "Denied only" },
  { value: "ready_to_bill", label: "Ready to bill" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "docs_missing", label: "Docs missing" },
];

export function isCredentialingListSegment(v: string): v is CredentialingListSegment {
  return CREDENTIALING_LIST_SEGMENTS.some((s) => s.value === v);
}
