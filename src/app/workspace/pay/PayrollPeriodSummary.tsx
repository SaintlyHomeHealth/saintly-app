import type { PayPeriodBounds } from "@/lib/payroll/pay-period";

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function PayrollPeriodSummary({
  bounds,
  batchStatus,
  deadlinePassed,
}: {
  bounds: PayPeriodBounds;
  batchStatus: string | null;
  deadlinePassed: boolean;
}) {
  const deadline = new Date(bounds.submissionDeadline);

  const steps = [
    { key: "work", label: "Work week", sub: `${weekdayLabel(bounds.payPeriodStart)} – ${weekdayLabel(bounds.payPeriodEnd)}`, tone: "from-sky-500 to-cyan-500" },
    { key: "submit", label: "Submit", sub: `Tuesday · ${deadline.toLocaleString(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`, tone: "from-indigo-500 to-sky-500" },
    { key: "pay", label: "Payday", sub: `Wednesday · ${weekdayLabel(bounds.payDate)}`, tone: "from-emerald-500 to-teal-500" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-900/70">Current batch</p>
          <p className="text-lg font-bold text-slate-900">
            {batchStatus ? (
              <span className="capitalize">{batchStatus.replace(/_/g, " ")}</span>
            ) : (
              <span className="text-slate-600">No batch opened yet</span>
            )}
          </p>
        </div>
        {deadlinePassed ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">Submission closed for this period</span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">Accepting submissions</span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.key}
            className={`relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br ${s.tone} p-[1px] shadow-sm shadow-slate-200/50`}
          >
            <div className="h-full rounded-[15px] bg-white/95 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-slate-600">
        Visits that pass every payroll check roll into your total automatically. Anything missing documentation, on hold, or outside this
        Monday–Sunday window stays out until it is fixed or the next period.
      </p>
    </div>
  );
}
