/** Shared status pill styling for recruiting list + detail. */

export function recruitingStatusPillClass(status: string): string {
  const base =
    "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 whitespace-nowrap";
  const s = status.trim();
  if (s === "Interested") {
    return `${base} bg-emerald-50 text-emerald-900 ring-emerald-200/80`;
  }
  if (s === "Not Interested") {
    return `${base} bg-slate-100 text-slate-700 ring-slate-200/90`;
  }
  if (s === "New") {
    return `${base} bg-sky-50 text-sky-900 ring-sky-200/80`;
  }
  if (s === "Attempted Contact" || s === "Text Sent" || s === "Waiting on Reply") {
    return `${base} bg-indigo-50 text-indigo-900 ring-indigo-200/80`;
  }
  if (s === "Spoke") {
    return `${base} bg-cyan-50 text-cyan-900 ring-cyan-200/80`;
  }
  if (s === "On Hold") {
    return `${base} bg-amber-50 text-amber-900 ring-amber-200/80`;
  }
  return `${base} bg-white text-slate-800 ring-slate-200/90`;
}
