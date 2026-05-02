/** Immediate placeholder while `/workspace/pay` RSC loads (bottom-nav tab switches). */
export default function WorkspacePayLoading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col gap-3 px-4 pb-8 pt-5 sm:px-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200/80" />
      <div className="h-24 w-full max-w-xl animate-pulse rounded-2xl bg-slate-100/90" />
      <div className="h-40 w-full max-w-xl animate-pulse rounded-2xl bg-slate-100/90" />
    </div>
  );
}
