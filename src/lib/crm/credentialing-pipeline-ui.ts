import type {
  ContractingStatusValue,
  CredentialingStatusValue,
} from "@/lib/crm/credentialing-status-options";

/** Simplified detail-page pipeline (maps to credentialing + contracting fields). Order: … Active → Denied → Stalled. */
export const SIMPLIFIED_CREDENTIALING_PIPELINE_STEPS = [
  { label: "Not started", short: "Start" },
  { label: "In progress", short: "Work" },
  { label: "Submitted", short: "Sent" },
  { label: "In review", short: "Review" },
  { label: "Active", short: "Live" },
  { label: "Denied", short: "Denied" },
  { label: "Stalled", short: "Hold" },
] as const;

export type SimplifiedCredentialingPipelineStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function getSimplifiedCredentialingPipelineTargets(
  stepIndex: SimplifiedCredentialingPipelineStepIndex
): { credentialing_status: CredentialingStatusValue; contracting_status: ContractingStatusValue } {
  switch (stepIndex) {
    case 0:
      return { credentialing_status: "not_started", contracting_status: "not_started" };
    case 1:
      return { credentialing_status: "in_progress", contracting_status: "pending" };
    case 2:
      return { credentialing_status: "submitted", contracting_status: "pending" };
    case 3:
      return { credentialing_status: "enrolled", contracting_status: "pending" };
    case 4:
      return { credentialing_status: "enrolled", contracting_status: "contracted" };
    case 5:
      return { credentialing_status: "denied", contracting_status: "pending" };
    case 6:
      return { credentialing_status: "stalled", contracting_status: "stalled" };
    default:
      return { credentialing_status: "in_progress", contracting_status: "pending" };
  }
}

export function getSimplifiedCredentialingPipelineStepIndex(
  credentialingStatus: string,
  contractingStatus: string
): SimplifiedCredentialingPipelineStepIndex {
  const cred = credentialingStatus.trim();
  const cont = contractingStatus.trim();

  if (cred === "denied") return 5;
  if (cred === "stalled" || cont === "stalled") return 6;
  if (cred === "enrolled" && cont === "contracted") return 4;
  if (cred === "enrolled") return 3;
  if (cred === "submitted") return 2;
  if (cred === "in_progress") return 1;
  if (cred === "not_started") return 0;
  return 1;
}

export function simplifiedCredentialingPipelineStepButtonClass(
  stepIndex: number,
  currentIndex: number,
  opts?: { deniedStepIndex?: number }
): string {
  const deniedIdx = opts?.deniedStepIndex ?? 5;
  if (stepIndex === deniedIdx) {
    if (stepIndex < currentIndex) {
      return "border-red-200/90 bg-red-50/90 text-red-900 shadow-sm hover:bg-red-100/90";
    }
    if (stepIndex === currentIndex) {
      return "border-red-500 bg-red-50 text-red-950 shadow-md ring-2 ring-red-200/90";
    }
    return "border-red-200/70 bg-white text-red-800/90 hover:bg-red-50/80 hover:text-red-950";
  }

  if (stepIndex < currentIndex) {
    return "border-slate-200/90 bg-slate-50 text-slate-700 shadow-sm hover:bg-white";
  }
  if (stepIndex === currentIndex) {
    return "border-slate-800/20 bg-slate-900 text-white shadow-md ring-2 ring-slate-300/80";
  }
  return "border-slate-200/90 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800";
}
