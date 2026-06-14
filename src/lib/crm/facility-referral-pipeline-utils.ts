import type {
  FacilityReferralPipelineStageKey,
} from "@/lib/crm/facility-referral-pipeline-types";
import { FACILITY_REFERRAL_PIPELINE_STAGES } from "@/lib/crm/facility-referral-pipeline-types";

export function isFacilitySourcedLead(row: {
  source?: string | null;
  referral_source_type?: string | null;
  referring_facility_id?: string | null;
}): boolean {
  const source = (row.source ?? "").trim().toLowerCase();
  const refType = (row.referral_source_type ?? "").trim().toLowerCase();
  if (source === "facility_outreach") return true;
  if (refType === "facility_outreach") return true;
  if (refType === "printed_qr") return true;
  if (refType === "printed_qr_matched") return true;
  if (refType === "packet_link") return true;
  if (refType === "unmatched_printed_qr") return true;
  if (row.referring_facility_id) return true;
  return false;
}

export function pipelineStageForLeadStatus(status: string | null | undefined): {
  key: FacilityReferralPipelineStageKey;
  label: string;
} {
  const s = (status ?? "").trim().toLowerCase();
  for (const stage of FACILITY_REFERRAL_PIPELINE_STAGES) {
    if ((stage.statuses as readonly string[]).includes(s)) {
      return { key: stage.key, label: stage.label };
    }
  }
  return { key: "new_referral", label: "New Referral" };
}

export function leadStatusForPipelineStage(stageKey: FacilityReferralPipelineStageKey): string {
  switch (stageKey) {
    case "new_referral":
      return "new";
    case "contact_patient":
      return "attempted_contact";
    case "verify_insurance":
      return "verify_insurance";
    case "waiting_orders":
      return "waiting_on_referral";
    case "ready_soc":
      return "ready_to_convert";
    case "converted":
      return "converted";
    case "lost":
      return "dead_lead";
    default:
      return "new";
  }
}

export function pipelineStageLabel(key: FacilityReferralPipelineStageKey): string {
  return FACILITY_REFERRAL_PIPELINE_STAGES.find((s) => s.key === key)?.label ?? key;
}

export function referralAgeDays(fromIso: string | null | undefined): number {
  if (!fromIso) return 0;
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

export function referralUrgency(input: {
  ageDays: number;
  pipelineStage: FacilityReferralPipelineStageKey;
  nextTaskDue: string | null;
  intakeOwnerId: string | null;
}): "normal" | "attention" | "urgent" {
  if (input.pipelineStage === "converted" || input.pipelineStage === "lost") return "normal";
  if (!input.intakeOwnerId && input.ageDays >= 1) return "urgent";
  if (input.pipelineStage === "waiting_orders" && input.ageDays >= 3) return "urgent";
  if (input.ageDays >= 3) return "attention";
  if (input.nextTaskDue) {
    const due = new Date(input.nextTaskDue).getTime();
    if (!Number.isNaN(due) && due < Date.now()) return "urgent";
  }
  return "normal";
}

export function intakeOwnerRoles(): string[] {
  return ["super_admin", "admin", "manager", "staff", "nurse", "dispatch", "credentialing"];
}

export function canRoleBeIntakeOwner(role: string | null | undefined): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return intakeOwnerRoles().includes(r);
}
