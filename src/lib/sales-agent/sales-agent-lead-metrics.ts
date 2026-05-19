import {
  formatSalesAgentFriendlyStatus,
  isSalesAgentStatusConverted,
  isSalesAgentStatusDuplicate,
  isSalesAgentStatusNotEligible,
  isSalesAgentStatusPending,
} from "@/lib/sales-agent/sales-agent-status-labels";

export type SalesAgentLeadRow = {
  id: string;
  status: string | null;
  created_at: string;
  converted_to_patient_at: string | null;
  primary_payer_name?: string | null;
  insurance_name?: string | null;
  insurance_type?: string | null;
  contacts?: {
    full_name?: string | null;
    primary_phone?: string | null;
  } | {
    full_name?: string | null;
    primary_phone?: string | null;
  }[] | null;
};

function contactFromRow(row: SalesAgentLeadRow) {
  const c = row.contacts;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}

export function salesAgentLeadPatientName(row: SalesAgentLeadRow): string {
  const c = contactFromRow(row);
  const name = (c?.full_name ?? "").trim();
  return name || "—";
}

export function salesAgentLeadPhone(row: SalesAgentLeadRow): string {
  const c = contactFromRow(row);
  return (c?.primary_phone ?? "").trim() || "—";
}

export function salesAgentLeadInsuranceLabel(row: SalesAgentLeadRow): string {
  const name = (row.insurance_name ?? row.primary_payer_name ?? "").trim();
  const type = (row.insurance_type ?? "").trim();
  if (name && type) return `${name} (${type})`;
  return name || type || "—";
}

export type SalesAgentDashboardMetrics = {
  totalSubmitted: number;
  pending: number;
  converted: number;
  notEligible: number;
  duplicate: number;
  conversionRate: number | null;
};

export function computeSalesAgentDashboardMetrics(rows: SalesAgentLeadRow[]): SalesAgentDashboardMetrics {
  const totalSubmitted = rows.length;
  const converted = rows.filter((r) =>
    isSalesAgentStatusConverted(r.status, r.converted_to_patient_at)
  ).length;
  const notEligible = rows.filter((r) => isSalesAgentStatusNotEligible(r.status)).length;
  const duplicate = rows.filter((r) => isSalesAgentStatusDuplicate(r.status)).length;
  const pending = rows.filter((r) =>
    isSalesAgentStatusPending(r.status, r.converted_to_patient_at)
  ).length;
  const validSubmitted = totalSubmitted - duplicate;
  const conversionRate =
    validSubmitted > 0 ? Math.round((converted / validSubmitted) * 1000) / 10 : null;
  return { totalSubmitted, pending, converted, notEligible, duplicate, conversionRate };
}

export function formatSalesAgentStatus(
  status: string | null | undefined,
  convertedToPatientAt?: string | null
): string {
  return formatSalesAgentFriendlyStatus(status, { convertedToPatientAt });
}
