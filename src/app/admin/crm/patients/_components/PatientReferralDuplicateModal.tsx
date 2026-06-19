"use client";

import Link from "next/link";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  describePatientReferralDuplicateReasons,
  type PatientReferralDuplicateRow,
} from "@/lib/crm/patient-referral/duplicates";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

type PatientReferralDuplicateModalProps = {
  open: boolean;
  duplicates: PatientReferralDuplicateRow[];
  pending?: boolean;
  onOpenPatient: (patientId: string) => void;
  onUpdateExisting: (patientId: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
};

export function PatientReferralDuplicateModal({
  open,
  duplicates,
  pending,
  onOpenPatient,
  onUpdateExisting,
  onCreateAnyway,
  onCancel,
}: PatientReferralDuplicateModalProps) {
  if (!open || duplicates.length === 0) return null;

  const primary = duplicates[0]!;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[24px] border border-amber-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900">
            <span className="text-lg font-bold">!</span>
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-slate-900">Possible duplicate found</h4>
            <p className="mt-1 text-sm text-slate-600">
              An existing patient chart may match this referral. Review before creating a duplicate record.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {duplicates.map((d) => (
            <li key={d.patient_id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                {describePatientReferralDuplicateReasons(d.reasons)}
              </div>
              <div className="mt-1 font-semibold text-slate-900">{d.full_name}</div>
              <div className="mt-2 grid gap-1 text-xs text-slate-600">
                <div>
                  <span className="font-medium text-slate-500">Phone:</span>{" "}
                  {d.phone ? formatPhoneForDisplay(d.phone) : "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">DOB:</span> {d.date_of_birth ?? "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Status:</span> {d.patient_status}
                  {d.intake_status ? ` · ${d.intake_status}` : ""}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  disabled={pending}
                  onClick={() => onOpenPatient(d.patient_id)}
                >
                  Open Patient
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  disabled={pending}
                  onClick={() => onUpdateExisting(d.patient_id)}
                >
                  Update Existing Patient
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={pending}
            onClick={onCancel}
          >
            Back to review
          </button>
          <button type="button" className={crmPrimaryCtaCls} disabled={pending} onClick={onCreateAnyway}>
            Create Patient anyway
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-500">
          Primary match:{" "}
          <Link href={`/admin/crm/patients/${primary.patient_id}`} className="font-semibold text-sky-800 hover:underline">
            {primary.full_name}
          </Link>
        </p>
      </div>
    </div>
  );
}
