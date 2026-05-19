import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import {
  computeSalesAgentDashboardMetrics,
  formatSalesAgentStatus,
  salesAgentLeadInsuranceLabel,
  salesAgentLeadPatientName,
  salesAgentLeadPhone,
  type SalesAgentLeadRow,
} from "@/lib/sales-agent/sales-agent-lead-metrics";
import {
  DEFAULT_SALES_AGENT_PATHS,
  type SalesAgentPaths,
} from "@/lib/sales-agent/sales-agent-workspace-paths";
import { formatAppDate } from "@/lib/datetime/app-timezone";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import type { StaffProfile } from "@/lib/staff-profile";

const LEAD_LIST_SELECT =
  "id, status, created_at, converted_to_patient_at, primary_payer_name, insurance_name, insurance_type, contacts ( full_name, primary_phone )";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDate(iso, "—", { month: "short", day: "numeric", year: "numeric" });
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${tone ?? ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

type Props = {
  staff: StaffProfile;
  paths?: SalesAgentPaths;
};

export async function SalesAgentDashboard({ staff, paths = DEFAULT_SALES_AGENT_PATHS }: Props) {
  const { data: rows, error } = await supabaseAdmin
    .from("leads")
    .select(LEAD_LIST_SELECT)
    .eq("produced_by_sales_agent_id", staff.user_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[sales-agent/dashboard] load:", error.message);
  }

  const leads = (rows ?? []) as SalesAgentLeadRow[];
  const metrics = computeSalesAgentDashboardMetrics(leads);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">My Orders</h2>
          <p className="mt-1 text-sm text-slate-600">Track submitted orders and conversion outcomes.</p>
        </div>
        <Link
          href={paths.newLead}
          className="inline-flex items-center rounded-full bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Create New Order / Lead
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Submitted" value={metrics.totalSubmitted} />
        <MetricCard label="Pending" value={metrics.pending} />
        <MetricCard label="Converted patients" value={metrics.converted} tone="ring-1 ring-emerald-100" />
        <MetricCard label="Not eligible" value={metrics.notEligible} />
        <MetricCard label="Duplicate" value={metrics.duplicate} />
        <MetricCard
          label="Conversion rate"
          value={metrics.conversionRate != null ? `${metrics.conversionRate}%` : "—"}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Recent leads</h3>
        </div>
        {leads.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No leads yet. Create your first order above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Patient</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Insurance</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Submitted</th>
                  <th className="px-4 py-2">Converted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-2.5">
                      <Link
                        href={paths.leadDetail(row.id)}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {salesAgentLeadPatientName(row)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-700">
                      {(() => {
                        const p = salesAgentLeadPhone(row);
                        return p === "—" ? p : formatPhoneNumber(p);
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{salesAgentLeadInsuranceLabel(row)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                        {formatSalesAgentStatus(row.status, row.converted_to_patient_at)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{fmtDate(row.created_at)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-600">{fmtDate(row.converted_to_patient_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
