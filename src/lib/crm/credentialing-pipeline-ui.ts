import type {
  ContractingStatusValue,
  CredentialingStatusValue,
} from "@/lib/crm/credentialing-status-options";

/** Horizontal deal-style pipeline (UI). Maps to DB `credentialing_status` + `contracting_status`. */
export const CREDENTIALING_PIPELINE_STEPS = [
  { label: "Not Started", short: "Start" },
  { label: "In Progress", short: "Working" },
  { label: "Submitted", short: "Sent" },
  { label: "Credentialed", short: "Creds" },
  { label: "Contracted", short: "Contract" },
  { label: "Active", short: "Live" },
] as const;

export type CredentialingPipelineStepIndex = 0 | 1 | 2 | 3 | 4 | 5;

export function getCredentialingPipelineStepIndex(
  credentialingStatus: string,
  contractingStatus: string
): CredentialingPipelineStepIndex {
  const cred = credentialingStatus.trim();
  const cont = contractingStatus.trim();

  if (cred === "enrolled" && cont === "contracted") return 5;
  if (cred === "enrolled" && cont === "in_contracting") return 4;
  if (cred === "enrolled") return 3;
  if (cred === "submitted") return 2;
  if (cred === "in_progress" || cred === "stalled") return 1;
  if (cred === "not_started") return 0;
  return 1;
}

export function getCredentialingPipelineTargets(
  stepIndex: CredentialingPipelineStepIndex
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
      return { credentialing_status: "enrolled", contracting_status: "in_contracting" };
    case 5:
      return { credentialing_status: "enrolled", contracting_status: "contracted" };
  }
}

/** Past / current / future styling for horizontal stepper buttons. */
export function credentialingPipelineStepButtonClass(stepIndex: number, currentIndex: number): string {
  if (stepIndex < currentIndex) {
    return "border-emerald-200/90 bg-emerald-50/95 text-emerald-900 shadow-sm hover:bg-emerald-100";
  }
  if (stepIndex === currentIndex) {
    if (currentIndex <= 1) {
      return "border-amber-300 bg-amber-50 text-amber-950 shadow-md ring-2 ring-amber-200/80";
    }
    if (currentIndex === 2) {
      return "border-sky-400 bg-sky-50 text-sky-950 shadow-md ring-2 ring-sky-200/80";
    }
    return "border-emerald-400 bg-emerald-50 text-emerald-950 shadow-md ring-2 ring-emerald-200/80";
  }
  return "border-slate-200/90 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-700";
}

/** Simplified detail-page pipeline (maps to existing credentialing + contracting fields). */
export const SIMPLIFIED_CREDENTIALING_PIPELINE_STEPS = [
  { label: "Not started", short: "Start" },
  { label: "In progress", short: "Work" },
  { label: "Submitted", short: "Sent" },
  { label: "In review", short: "Review" },
  { label: "Active", short: "Live" },
  { label: "Stalled", short: "Hold" },
] as const;

export type SimplifiedCredentialingPipelineStepIndex = 0 | 1 | 2 | 3 | 4 | 5;

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

  if (cred === "stalled" || cont === "stalled") return 5;
  if (cred === "enrolled" && cont === "contracted") return 4;
  if (cred === "enrolled") return 3;
  if (cred === "submitted") return 2;
  if (cred === "in_progress") return 1;
  if (cred === "not_started") return 0;
  return 1;
}

export function simplifiedCredentialingPipelineStepButtonClass(stepIndex: number, currentIndex: number): string {
  if (stepIndex < currentIndex) {
    return "border-slate-200/90 bg-slate-50 text-slate-700 shadow-sm hover:bg-white";
  }
  if (stepIndex === currentIndex) {
    return "border-slate-800/20 bg-slate-900 text-white shadow-md ring-2 ring-slate-300/80";
  }
  return "border-slate-200/90 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800";
}
