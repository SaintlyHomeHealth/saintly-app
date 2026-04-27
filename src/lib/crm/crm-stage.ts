export const CRM_STAGES = ["lead", "intake", "patient"] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

export function normalizeCrmStage(v: unknown): CrmStage {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "intake" || s === "patient") return s;
  return "lead";
}

export function isValidCrmStage(v: unknown): v is CrmStage {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "lead" || s === "intake" || s === "patient";
}

export function formatCrmStageLabel(s: CrmStage): string {
  switch (s) {
    case "lead":
      return "Lead";
    case "intake":
      return "Intake";
    case "patient":
      return "Patient";
    default:
      return s;
  }
}

/** Clinical / patient-stage workflows — tied to `crm_stage`, not only `leads.status`. */
export function isLeadPatientStage(crmStage: unknown): boolean {
  return normalizeCrmStage(crmStage) === "patient";
}

/** Resolve CRM stage from DB + legacy `status = converted` rows. */
export function resolveLeadCrmStage(status: unknown, crmStageRaw: unknown): CrmStage {
  const st = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (st === "converted") return "patient";
  return normalizeCrmStage(crmStageRaw);
}
