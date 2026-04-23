/** Lightweight placeholders for dynamically loaded onboarding subsections. */
export function ShimmerBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200/80 to-slate-100 bg-[length:200%_100%] ${className}`}
    />
  );
}

export function OnboardingChecklistSkeleton() {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-4 w-48 rounded bg-slate-200" />
      <p className="mt-2 h-3 w-full max-w-md rounded bg-slate-100" />
      <div className="mt-4 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-slate-100" />
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <ShimmerBlock key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function OnboardingDiagnosticsSkeleton() {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5">
      <div className="h-4 w-40 rounded bg-slate-200" />
    </div>
  );
}

export function SectionCardSkeleton() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="h-5 w-56 rounded bg-slate-200" />
      <p className="mt-2 h-3 w-3/4 max-w-lg rounded bg-slate-100" />
      <div className="mt-5 space-y-3">
        <ShimmerBlock className="h-20 w-full" />
        <ShimmerBlock className="h-20 w-full" />
      </div>
    </div>
  );
}

export function DocumentColumnsSkeleton() {
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="min-w-0 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="h-5 w-40 rounded bg-slate-200" />
          <p className="mt-2 h-3 w-full rounded bg-slate-100" />
          <ShimmerBlock className="mt-4 h-24 w-full" />
        </div>
      ))}
    </div>
  );
}
