/** Skeleton while `/admin/employees/[employeeId]` RSC loads (heavy parallel queries). */
export default function AdminEmployeeDetailLoading() {
  return (
    <div className="space-y-6 p-6" aria-busy="true" aria-label="Loading employee">
      <div className="h-10 w-64 max-w-full animate-pulse rounded-lg bg-slate-200/90" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="h-36 animate-pulse rounded-xl border border-slate-100 bg-slate-50/90" />
          <div className="h-48 animate-pulse rounded-xl border border-slate-100 bg-slate-50/90" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-100 bg-slate-50/90" />
        </div>
        <div className="hidden h-72 animate-pulse rounded-xl border border-slate-100 bg-slate-50/90 lg:block" />
      </div>
    </div>
  );
}
