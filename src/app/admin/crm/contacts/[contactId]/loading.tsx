/** Skeleton while CRM contact detail loads. */
export default function AdminCrmContactDetailLoading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading contact">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-slate-200/90" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="h-80 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm" />
        <div className="min-h-[24rem] animate-pulse rounded-xl border border-slate-100 bg-slate-50/80" />
      </div>
    </div>
  );
}
