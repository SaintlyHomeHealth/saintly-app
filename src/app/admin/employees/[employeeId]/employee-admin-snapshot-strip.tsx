import type { ReactNode } from "react";

type Props = {
  name: string;
  roleLine: string;
  statusLabel: string;
  statusBadgeClass: string;
  /** Readiness line (e.g. onboarding % · survey) — middle column on desktop */
  readinessSummaryLine: string;
  /** Activation blockers when Mark Active is disabled — middle column, optional */
  activationBlockerSummary?: string | null;
  email: string;
  phone: string | null;
  hireDateLabel: string;
  hireDateDisplay: string;
  children?: ReactNode;
};

/**
 * Desktop: 3-zone horizontal strip — identity | summary | actions.
 * Avoids two-column flex where shrink-0 actions squeeze flex-1 identity.
 */
export default function EmployeeAdminSnapshotStrip({
  name,
  roleLine,
  statusLabel,
  statusBadgeClass,
  readinessSummaryLine,
  activationBlockerSummary,
  email,
  phone,
  hireDateLabel,
  hireDateDisplay,
  children,
}: Props) {
  return (
    <div
      id="onboarding-admin-summary"
      className="scroll-mt-24 border-b border-slate-200 bg-white px-3 py-3 sm:px-4"
    >
      <div
        className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(17.5rem,28rem)_minmax(0,1fr)_auto] lg:items-start lg:gap-x-6"
      >
        {/* Zone 1 — identity (fixed min width on desktop, does not shrink below minmax) */}
        <div className="min-w-0 space-y-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl [overflow-wrap:anywhere]">
            {name}
          </h1>
          <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">{roleLine}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <p className="[overflow-wrap:anywhere]">
              <span className="font-semibold text-slate-500">Email </span>
              {email}
            </p>
            {phone ? (
              <p className="[overflow-wrap:anywhere]">
                <span className="font-semibold text-slate-500">Phone </span>
                {phone}
              </p>
            ) : null}
            <p className="text-slate-500 [overflow-wrap:anywhere]">
              <span className="font-semibold text-slate-500">{hireDateLabel} </span>
              <span className="text-slate-800">{hireDateDisplay}</span>
            </p>
          </div>
        </div>

        {/* Zone 2 — readiness / blockers (takes remaining width, wraps normally) */}
        <div className="min-w-0 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{readinessSummaryLine}</p>
          {activationBlockerSummary ? (
            <p className="mt-2 text-sm font-medium leading-relaxed text-red-800 [overflow-wrap:anywhere]">
              Cannot mark active yet: {activationBlockerSummary}
            </p>
          ) : null}
        </div>

        {/* Zone 3 — actions (align end, wrap inside column; min-w-0 allows grid to size auto column) */}
        {children ? (
          <div className="min-w-0 w-full max-w-full justify-self-stretch border-t border-slate-100 pt-3 lg:w-auto lg:max-w-[26rem] lg:justify-self-end lg:border-t-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">{children}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
