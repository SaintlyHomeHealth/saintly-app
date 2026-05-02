/** Skeleton while CRM lead workspace loads. */
export default function AdminCrmLeadDetailLoading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading lead">
      <div className="h-10 w-72 animate-pulse rounded-lg bg-slate-200/90" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-100/90" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <div className="h-56 animate-pulse rounded-xl border border-slate-100 bg-white" />
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-slate-100 bg-slate-50/80" />
    </div>
  );
}
