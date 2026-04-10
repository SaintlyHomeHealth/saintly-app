/** Shared status pill styling for recruiting list + detail. */

export function recruitingStatusPillClass(status: string): string {
  const base =
    "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 whitespace-nowrap";
  const s = status.trim();
  if (s === "Interested" || s === "Hired") {
    return `${base} bg-emerald-50 text-emerald-900 ring-emerald-200/80`;
  }
  if (s === "Not Interested" || s === "Archived") {
    return `${base} bg-slate-100 text-slate-700 ring-slate-200/90`;
  }
  if (s === "New" || s === "Not Contacted") {
    return `${base} bg-sky-50 text-sky-900 ring-sky-200/80`;
  }
  if (s === "Attempted Contact" || s === "Text Sent" || s === "Waiting on Reply") {
    return `${base} bg-indigo-50 text-indigo-900 ring-indigo-200/80`;
  }
  if (s === "Spoke") {
    return `${base} bg-cyan-50 text-cyan-900 ring-cyan-200/80`;
  }
  if (s === "Maybe Later" || s === "Follow Up Later" || s === "On Hold") {
    return `${base} bg-amber-50 text-amber-900 ring-amber-200/80`;
  }
  if (s === "No Response") {
    return `${base} bg-rose-50 text-rose-900 ring-rose-200/80`;
  }
  if (s === "Interviewing") {
    return `${base} bg-violet-50 text-violet-900 ring-violet-200/80`;
  }
  return `${base} bg-white text-slate-800 ring-slate-200/90`;
}

export function recruitingInterestPillClass(level: string): string {
  const base =
    "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 whitespace-nowrap";
  const s = level.trim().toLowerCase();
  if (s === "hot") {
    return `${base} bg-orange-50 text-orange-950 ring-orange-200/80`;
  }
  if (s === "warm") {
    return `${base} bg-amber-50 text-amber-950 ring-amber-200/80`;
  }
  if (s === "cold") {
    return `${base} bg-slate-100 text-slate-700 ring-slate-200/90`;
  }
  if (s === "maybe_later") {
    return `${base} bg-blue-50 text-blue-950 ring-blue-200/80`;
  }
  return `${base} bg-white text-slate-600 ring-slate-200/80`;
}
