/** Skeleton while CRM patient intake page loads. */
export default function AdminCrmPatientDetailLoading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading patient">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200/90" />
      <div className="h-14 animate-pulse rounded-xl bg-slate-100/90" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_1fr]">
        <div className="space-y-3">
          <div className="h-44 animate-pulse rounded-xl border border-slate-100 bg-white" />
          <div className="h-32 animate-pulse rounded-xl border border-slate-100 bg-white" />
        </div>
        <div className="min-h-[28rem] animate-pulse rounded-xl border border-slate-100 bg-slate-50/80" />
      </div>
    </div>
  );
}
