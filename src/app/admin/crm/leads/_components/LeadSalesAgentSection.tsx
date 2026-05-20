import Link from "next/link";

import { LeadSsnRevealField } from "@/app/admin/crm/leads/_components/LeadSsnRevealField";
import { LEAD_DOCUMENT_TYPE_LABELS } from "@/lib/crm/lead-documents-storage";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import type { LeadWorkspaceStaffOption } from "../lead-workspace";

export type LeadDocumentAdminRow = {
  id: string;
  document_type: string;
  created_at: string;
};

export type LeadSalesAgentSectionProps = {
  leadId: string;
  producedBySalesAgentId: string | null;
  producedByAgentName: string | null;
  ownershipLocked: boolean;
  assignedToStaffId: string;
  staffOptions: LeadWorkspaceStaffOption[];
  convertedToPatientAt: string | null;
  convertedPatientId: string | null;
  caregiverName: string;
  caregiverPhone: string;
  caregiverRelationship: string;
  reasonForReferral: string;
  insuranceMemberId: string;
  socialSecurityNumber: string;
  salesAgentHiddenAt: string | null;
  documents: LeadDocumentAdminRow[];
  documentsUnavailable?: boolean;
};

function staffOptionLabel(s: LeadWorkspaceStaffOption): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) return em;
  return `${s.user_id.slice(0, 8)}…`;
}

export function LeadSalesAgentSection({
  leadId,
  producedBySalesAgentId,
  producedByAgentName,
  ownershipLocked,
  assignedToStaffId,
  staffOptions,
  convertedToPatientAt,
  convertedPatientId,
  caregiverName,
  caregiverPhone,
  caregiverRelationship,
  reasonForReferral,
  insuranceMemberId,
  socialSecurityNumber,
  salesAgentHiddenAt,
  documents,
  documentsUnavailable = false,
}: LeadSalesAgentSectionProps) {
  if (!producedBySalesAgentId) return null;

  return (
    <div className="rounded-[28px] border border-violet-200/90 bg-violet-50/30 p-5 shadow-sm ring-1 ring-violet-100/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">Sales agent order</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">Produced by sales agent</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-950 ring-1 ring-violet-200">
          Source: Sales Agent
        </span>
        {salesAgentHiddenAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-950 ring-1 ring-amber-200">
            Hidden by Sales Agent
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Produced by (locked)</p>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            {producedByAgentName?.trim() || "Unknown sales agent"}
            {ownershipLocked ? (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                Locked
              </span>
            ) : null}
          </p>
        </div>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
          Assigned to (internal follow-up)
          <select name="assigned_to_staff_id" className="mt-0.5 w-full max-w-md rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800" defaultValue={assignedToStaffId}>
            <option value="">— Unassigned —</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {staffOptionLabel(s)}
              </option>
            ))}
          </select>
        </label>

        {convertedToPatientAt ? (
          <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
            Converted {new Date(convertedToPatientAt).toLocaleString()}
            {convertedPatientId ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/admin/crm/patients/${convertedPatientId}`} className="font-semibold underline">
                  Open patient
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {(caregiverName.trim() || caregiverPhone.trim() || caregiverRelationship.trim()) && (
        <dl className="mt-5 grid gap-3 border-t border-violet-100 pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-500">Caregiver</dt>
            <dd className="mt-0.5 text-sm text-slate-900">{caregiverName.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-500">Caregiver phone</dt>
            <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
              {caregiverPhone.trim() ? formatPhoneNumber(caregiverPhone) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-500">Relationship</dt>
            <dd className="mt-0.5 text-sm text-slate-900">{caregiverRelationship.trim() || "—"}</dd>
          </div>
        </dl>
      )}

      {reasonForReferral.trim() || insuranceMemberId.trim() ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {reasonForReferral.trim() ? (
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-semibold uppercase text-slate-500">Reason for referral</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{reasonForReferral.trim()}</dd>
            </div>
          ) : null}
          {insuranceMemberId.trim() ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase text-slate-500">Insurance member ID</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{insuranceMemberId.trim()}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {socialSecurityNumber.trim() ? (
        <dl className="mt-4 grid gap-3 border-t border-violet-100 pt-4 sm:grid-cols-2">
          <LeadSsnRevealField defaultValue={socialSecurityNumber} />
        </dl>
      ) : null}

      {documentsUnavailable ? (
        <p className="mt-5 border-t border-violet-100 pt-4 text-sm text-slate-600">Documents unavailable</p>
      ) : null}

      {documents.length > 0 ? (
        <div className="mt-5 border-t border-violet-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Medicare / insurance cards</p>
          <ul className="mt-2 space-y-1.5">
            {documents.map((doc) => {
              const label =
                LEAD_DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof LEAD_DOCUMENT_TYPE_LABELS] ??
                doc.document_type;
              return (
                <li key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-800">{label}</span>
                  <a
                    href={`/api/crm/leads/${leadId}/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-800 hover:underline"
                  >
                    View
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
