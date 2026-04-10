"use client";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import type { RecruitingDuplicateRow } from "@/lib/recruiting/recruiting-duplicates";
import { describeDuplicateReasons } from "@/lib/recruiting/recruiting-duplicates";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

function formatListDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type RecruitingDuplicateModalProps = {
  open: boolean;
  title?: string;
  duplicates: RecruitingDuplicateRow[];
  /** Shown when create-from-resume can attach file to existing row */
  resumeFile?: File | null;
  pending?: boolean;
  onOpenCandidate: (id: string) => void;
  onContinueAnyway: () => void;
  onAttachResumeTo?: (candidateId: string) => void;
  onCancel: () => void;
};

export function RecruitingDuplicateModal({
  open,
  title = "Possible duplicate",
  duplicates,
  resumeFile,
  pending,
  onOpenCandidate,
  onContinueAnyway,
  onAttachResumeTo,
  onCancel,
}: RecruitingDuplicateModalProps) {
  if (!open || duplicates.length === 0) return null;

  const primary = duplicates[0]!;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[24px] border border-amber-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900">
            <span className="text-lg font-bold">!</span>
          </div>
          <div className="min-w-0">
            <h4 className="text-base font-semibold text-slate-900">{title}</h4>
            <p className="mt-1 text-sm text-slate-600">
              We found an existing recruiting candidate that matches this contact information. Opening the existing record avoids
              duplicate nurse profiles.
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {duplicates.map((d) => (
            <li
              key={d.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-800"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                {describeDuplicateReasons(d.reasons)}
              </div>
              <div className="mt-1 font-semibold text-slate-900">{d.full_name}</div>
              <div className="mt-2 grid gap-1 text-xs text-slate-600">
                <div>
                  <span className="font-medium text-slate-500">Phone:</span> {d.phone ? formatPhoneForDisplay(d.phone) : "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Email:</span> {d.email?.trim() || "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">City:</span> {d.city?.trim() || "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Status:</span> {d.status ?? "—"}
                </div>
                <div>
                  <span className="font-medium text-slate-500">Last contact:</span> {formatListDate(d.last_contact_at)}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            className={`${crmPrimaryCtaCls} w-full justify-center sm:w-auto`}
            disabled={pending}
            onClick={() => onOpenCandidate(primary.id)}
          >
            Open existing
          </button>
          {resumeFile && onAttachResumeTo ? (
            <button
              type="button"
              className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-950 hover:bg-sky-100 sm:w-auto"
              disabled={pending}
              onClick={() => onAttachResumeTo(primary.id)}
            >
              Upload resume to {primary.full_name.split(" ")[0] ?? "candidate"}
            </button>
          ) : null}
          <button
            type="button"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
            disabled={pending}
            onClick={() => onContinueAnyway()}
          >
            Create new anyway
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
