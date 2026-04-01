/** DB check: payer_credentialing_records.credentialing_status */
export const CREDENTIALING_STATUS_VALUES = [
  "not_started",
  "in_progress",
  "submitted",
  "enrolled",
  "stalled",
] as const;

export type CredentialingStatusValue = (typeof CREDENTIALING_STATUS_VALUES)[number];

export const CREDENTIALING_STATUS_LABELS: Record<CredentialingStatusValue, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  enrolled: "Enrolled",
  stalled: "Stalled / needs follow-up",
};

/** DB check: payer_credentialing_records.contracting_status */
export const CONTRACTING_STATUS_VALUES = ["pending", "in_contracting", "contracted", "stalled"] as const;

export type ContractingStatusValue = (typeof CONTRACTING_STATUS_VALUES)[number];

export const CONTRACTING_STATUS_LABELS: Record<ContractingStatusValue, string> = {
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

/** List page filter segment (query `segment`). */
export type CredentialingListSegment =
  | "all"
  | "in_progress"
  | "submitted"
  | "enrolled"
  | "contracted"
  | "stalled";

export const CREDENTIALING_LIST_SEGMENTS: { value: CredentialingListSegment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "enrolled", label: "Enrolled" },
  { value: "contracted", label: "Contracted" },
  { value: "stalled", label: "Stalled" },
];

export function isCredentialingListSegment(v: string): v is CredentialingListSegment {
  return CREDENTIALING_LIST_SEGMENTS.some((s) => s.value === v);
}
