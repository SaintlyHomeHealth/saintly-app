/** Skeleton for admin CRM leads list — avoids frozen blank shell while counts + pagination query run. */
export default function AdminCrmLeadsListLoading() {
  return (
    <div className="space-y-4 p-4 sm:space-y-5 sm:p-6" aria-busy="true" aria-label="Loading leads">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-9 w-40 animate-pulse rounded-lg bg-slate-200/90" />
          <div className="h-4 w-[min(100%,28rem)] animate-pulse rounded bg-slate-100/95" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-50/80" />
      <div className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm" />
      <div className="hidden min-h-[min(60vh,28rem)] animate-pulse rounded-xl border border-slate-100 bg-slate-50/60 md:block" />
      <div className="flex flex-col gap-2 md:hidden">
        <div className="h-24 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <div className="h-24 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <div className="h-24 animate-pulse rounded-xl border border-slate-100 bg-white" />
      </div>
    </div>
  );
}
