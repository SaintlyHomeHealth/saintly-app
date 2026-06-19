"use client";

import {
  HEADSHOT_COMPLETE_STATUS,
  HEADSHOT_MISSING_STATUS,
} from "@/lib/employee-headshot";

import { EmployeeHeadshotAdminAvatar } from "./EmployeeHeadshotAdminAvatar";
import { useEmployeeHeadshotAdmin } from "./employee-headshot-admin-context";

type Props = {
  roleLine: string;
};

export default function EmployeeBadgeCard({ roleLine }: Props) {
  const { employeeId, displayName, hasHeadshot, badgeReady, hasDriversLicense } =
    useEmployeeHeadshotAdmin();

  return (
    <section
      id="employee-badge-section"
      className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Employee Badge
          </p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">Saintly identification badge</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">
            Used for employee identification, background check support, and on-site badge printing.
            Headshot and required identity documents must be on file before a badge can be issued.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
            badgeReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {badgeReady ? "Badge ready" : "Badge pending"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[16rem] rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50 to-white p-4 shadow-inner">
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-800">
              Saintly Home Health
            </p>
            <div className="mx-auto mt-3">
              <EmployeeHeadshotAdminAvatar size="lg" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900 [overflow-wrap:anywhere]">
              {displayName}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-600 [overflow-wrap:anywhere]">
              {roleLine}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              ID {employeeId.slice(0, 8).toUpperCase()}
            </p>
            <div className="mx-auto mt-3 flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              QR
            </div>
          </div>
        </div>

        <div className="space-y-3 text-sm text-slate-700">
          {badgeReady ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              Headshot and required identity documents are on file. Badge artwork can be generated
              when your badge printing workflow is enabled.
            </p>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              Badge ready once headshot and required identity documents are uploaded.
            </p>
          )}

          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                  hasHeadshot ? "bg-emerald-500" : "bg-red-400"
                }`}
              />
              <span>
                {hasHeadshot ? HEADSHOT_COMPLETE_STATUS : HEADSHOT_MISSING_STATUS}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                  hasDriversLicense ? "bg-emerald-500" : "bg-red-400"
                }`}
              />
              <span>
                {hasDriversLicense
                  ? "Driver’s license on file for identity verification."
                  : "Driver’s license missing for identity verification."}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
