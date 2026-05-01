/**
 * Shown immediately on client navigations between `/workspace/phone/*` segments while RSC loads.
 * Keeps the chrome + bottom nav responsive; only the main pane shows this placeholder.
 */
export default function WorkspacePhoneSegmentLoading() {
  return (
    <div
      className="ws-phone-page-shell flex min-h-[40vh] flex-1 flex-col gap-3 px-4 pb-8 pt-5 sm:px-5"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-200/80" />
      <div className="h-4 w-full max-w-md animate-pulse rounded bg-slate-100" />
      <div className="mt-4 space-y-2">
        <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100/90" />
        <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100/90" />
        <div className="h-16 w-full animate-pulse rounded-2xl bg-slate-100/90" />
      </div>
    </div>
  );
}
