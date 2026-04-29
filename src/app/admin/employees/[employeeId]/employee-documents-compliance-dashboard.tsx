"use client";

import Link from "next/link";

import EmployeeDocumentActions, {
  type EmployeeDocumentHistoryEntry,
} from "./EmployeeDocumentActions";

export type DashboardHistoryEntry = EmployeeDocumentHistoryEntry;

export type InitialHiringRowDef = {
  key: string;
  label: string;
  itemType: "document" | "form";
  statusLabel: string;
  statusTone: "green" | "red" | "amber" | "slate";
  lastUpdatedDisplay: string;
  viewUrl: string | null;
  downloadUrl?: string | null;
  documentType: string;
  uploadLabel: string;
  completeComplianceEventId?: string;
  anchorId: string;
  history: DashboardHistoryEntry[];
  workflowOpenHref?: string | null;
  portalHref?: string | null;
  fileRecordId?: string | null;
  fileRecordSource?: "applicant_file" | "legacy_document" | null;
};

export type OngoingComplianceRowDef = {
  key: string;
  label: string;
  statusLabel: string;
  statusTone: "green" | "red" | "amber" | "sky" | "slate";
  nextDueDisplay: string;
  sectionHref: string;
};

export type ExpiringCredentialRowDef = {
  key: string;
  label: string;
  statusLabel: "Expired" | "Expiring" | "Valid" | "Unknown";
  statusTone: "green" | "red" | "amber" | "slate";
  expirationDisplay: string;
  anchorId: string;
};

type Props = {
  employeeId: string;
  initialHiring: InitialHiringRowDef[];
  ongoingCompliance: OngoingComplianceRowDef[];
  expiringCredentials: ExpiringCredentialRowDef[];
};

function tonePill(tone: string) {
  switch (tone) {
    case "green":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "red":
      return "border-red-200 bg-red-50 text-red-900";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "sky":
      return "border-sky-200 bg-sky-50 text-sky-900";
    default:
      return "border-slate-200 bg-slate-50 text-slate-800";
  }
}

function SectionTable({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export default function EmployeeDocumentsComplianceDashboard({
  employeeId,
  initialHiring,
  ongoingCompliance,
  expiringCredentials,
}: Props) {
  return (
    <div id="documents-compliance-dashboard" className="min-w-0 space-y-4 scroll-mt-24">
      <SectionTable
        title="Initial hiring requirements"
        description="One-time file uploads and signed portal records for the personnel file. Credential expirations are tracked separately below."
      >
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last updated</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialHiring.map((row) => (
              <tr key={row.key} id={row.anchorId} className="scroll-mt-28">
                <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${tonePill(
                      row.statusTone
                    )}`}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{row.lastUpdatedDisplay}</td>
                <td className="px-3 py-2 text-right">
                  <EmployeeDocumentActions
                    employeeId={employeeId}
                    itemType={row.itemType}
                    uploadLabel={row.uploadLabel}
                    documentType={row.documentType}
                    workflowOpenHref={row.workflowOpenHref}
                    portalHref={row.portalHref}
                    viewUrl={row.viewUrl}
                    downloadUrl={row.downloadUrl}
                    completeComplianceEventId={row.completeComplianceEventId}
                    history={row.history}
                    fileRecordId={row.fileRecordId}
                    fileRecordSource={row.fileRecordSource}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionTable>

      <SectionTable
        title="Ongoing / compliance"
        description="Annual programs and recurring requirements (current event cycle)."
      >
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Next due</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ongoingCompliance.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${tonePill(
                      row.statusTone
                    )}`}
                  >
                    {row.statusLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{row.nextDueDisplay}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={row.sectionHref} className="text-xs font-semibold text-sky-700 underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionTable>

      <SectionTable
        title="Expiring / credentials"
        description="Tracked credentials with expiration dates. Use Edit in the table below for full history."
      >
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Expiration</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expiringCredentials.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  No credential records yet. Add credentials in the tracker below.
                </td>
              </tr>
            ) : (
              expiringCredentials.map((row) => (
                <tr key={row.key}>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.label}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${tonePill(
                        row.statusTone
                      )}`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.expirationDisplay}</td>
                  <td className="px-3 py-2 text-right">
                    <a href={`#${row.anchorId}`} className="text-xs font-semibold text-sky-700 underline">
                      Go to row
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionTable>
    </div>
  );
}
