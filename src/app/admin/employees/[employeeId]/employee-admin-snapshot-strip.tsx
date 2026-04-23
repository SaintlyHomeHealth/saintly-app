import type { ReactNode } from "react";

type Props = {
  name: string;
  roleLine: string;
  statusLabel: string;
  statusBadgeClass: string;
  onboardingSummaryLine: string;
  email: string;
  phone: string | null;
  hireDateLabel: string;
  hireDateDisplay: string;
  children?: ReactNode;
};

/**
 * Compact above-the-fold identity strip — avoids duplicating status cards below.
 */
export default function EmployeeAdminSnapshotStrip({
  name,
  roleLine,
  statusLabel,
  statusBadgeClass,
  onboardingSummaryLine,
  email,
  phone,
  hireDateLabel,
  hireDateDisplay,
  children,
}: Props) {
  return (
    <div
      id="onboarding-admin-summary"
      className="scroll-mt-24 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4"
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{name}</h1>
            <span className="text-sm text-slate-600">{roleLine}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
            <span className="text-xs text-slate-500">{onboardingSummaryLine}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
            <span className="min-w-0 break-all">{email}</span>
            {phone ? <span>{phone}</span> : null}
            <span className="text-slate-500">
              {hireDateLabel}: <span className="text-slate-800">{hireDateDisplay}</span>
            </span>
          </div>
        </div>
        {children ? (
          <div className="flex min-w-0 flex-col gap-1.5 lg:shrink-0 lg:items-end">
            <div className="flex flex-wrap justify-end gap-1.5">{children}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
