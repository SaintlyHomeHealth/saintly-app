import type { ReactNode } from "react";

type Props = {
  /** Client identity column (avatar, headshot upload, contact). */
  identityContent: ReactNode;
  readinessSummaryLine: string;
  activationBlockerSummary?: string | null;
  children?: ReactNode;
};

/**
 * Desktop: 3-zone horizontal strip — identity | summary | actions.
 */
export default function EmployeeAdminSnapshotStrip({
  identityContent,
  readinessSummaryLine,
  activationBlockerSummary,
  children,
}: Props) {
  return (
    <div
      id="onboarding-admin-summary"
      className="scroll-mt-24 border-b border-slate-200 bg-white px-3 py-3 sm:px-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(17.5rem,28rem)_minmax(0,1fr)_auto] lg:items-start lg:gap-x-6">
        <div className="min-w-0">{identityContent}</div>

        <div className="min-w-0 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{readinessSummaryLine}</p>
          {activationBlockerSummary ? (
            <p className="mt-2 text-sm font-medium leading-relaxed text-red-800 [overflow-wrap:anywhere]">
              Cannot mark active yet: {activationBlockerSummary}
            </p>
          ) : null}
        </div>

        {children ? (
          <div className="min-w-0 w-full max-w-full justify-self-stretch border-t border-slate-100 pt-3 lg:w-auto lg:max-w-[26rem] lg:justify-self-end lg:border-t-0 lg:pt-0">
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">{children}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
