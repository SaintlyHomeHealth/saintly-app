"use client";

import Link from "next/link";
import { useState } from "react";

import ApplicantFileUploadWithRefresh from "./ApplicantFileUploadWithRefresh";

export type DashboardHistoryEntry = {
  displayLine: string;
  viewUrl: string | null;
};

export type InitialHiringRowDef = {
  key: string;
  label: string;
  statusLabel: string;
  statusTone: "green" | "red" | "amber" | "slate";
  lastUpdatedDisplay: string;
  viewUrl: string | null;
  documentType: string;
  uploadLabel: string;
  completeComplianceEventId?: string;
  anchorId: string;
  history: DashboardHistoryEntry[];
  /** Related admin workflow (annual OIG, TB statement, credentials, etc.) — shown as “Open”. */
  workflowOpenHref?: string | null;
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
  const [uploadModal, setUploadModal] = useState<InitialHiringRowDef | null>(null);

  return (
    <div id="documents-compliance-dashboard" className="min-w-0 space-y-4 scroll-mt-24">
      <SectionTable
        title="Initial hiring requirements"
        description="One-time file uploads and verification items for the personnel file."
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
                  <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {row.workflowOpenHref ? (
                      <Link
                        href={row.workflowOpenHref}
                        className="text-xs font-semibold text-sky-700 underline"
                      >
                        Open
                      </Link>
                    ) : null}
                    {row.viewUrl ? (
                      <>
                        <a
                          href={row.viewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-sky-700 underline"
                        >
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => setUploadModal(row)}
                          className="text-xs font-semibold text-sky-700 underline"
                        >
                          Replace
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setUploadModal(row)}
                        className="text-xs font-semibold text-sky-700 underline"
                      >
                        Complete
                      </button>
                    )}
                  </div>
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

      {uploadModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/35 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-modal-title"
          onClick={() => setUploadModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-slate-200 bg-white sm:rounded-lg sm:shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
              <div>
                <h4 id="upload-modal-title" className="text-base font-semibold text-slate-900">
                  {uploadModal.uploadLabel}
                </h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  {uploadModal.viewUrl
                    ? "Replace the file on record or review prior versions."
                    : "Add the required file to complete this item. Review prior versions below if any."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadModal(null)}
                className="shrink-0 rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-4 py-3">
              <ApplicantFileUploadWithRefresh
                applicantId={employeeId}
                documentType={uploadModal.documentType}
                label={uploadModal.uploadLabel}
                completeComplianceEventId={uploadModal.completeComplianceEventId}
              />

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Version history</p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border border-slate-100">
                  {uploadModal.history.length === 0 ? (
                    <li className="px-2 py-2 text-xs text-slate-500">No prior uploads.</li>
                  ) : (
                    uploadModal.history.map((h, index) => (
                      <li
                        key={`${h.displayLine}-${index}`}
                        className="flex items-center justify-between gap-2 border-b border-slate-50 px-2 py-1.5 text-xs last:border-0"
                      >
                        <span className="text-slate-700">{h.displayLine}</span>
                        {h.viewUrl ? (
                          <a
                            href={h.viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 font-semibold text-sky-700 underline"
                          >
                            View
                          </a>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
