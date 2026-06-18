/** Status pill styling for Facebook recruiting leads list + detail. */

export function facebookRecruitingLeadStatusPillClass(status: string): string {
  const base =
    "inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 whitespace-nowrap";
  const s = status.trim();
  if (s === "Hired") {
    return `${base} bg-emerald-50 text-emerald-900 ring-emerald-200/80`;
  }
  if (s === "Not Qualified") {
    return `${base} bg-slate-100 text-slate-700 ring-slate-200/90`;
  }
  if (s === "New") {
    return `${base} bg-sky-50 text-sky-900 ring-sky-200/80`;
  }
  if (s === "Contacted") {
    return `${base} bg-indigo-50 text-indigo-900 ring-indigo-200/80`;
  }
  if (s === "Interview Scheduled" || s === "Credentialing") {
    return `${base} bg-violet-50 text-violet-900 ring-violet-200/80`;
  }
  if (s === "No Response") {
    return `${base} bg-rose-50 text-rose-900 ring-rose-200/80`;
  }
  return `${base} bg-white text-slate-800 ring-slate-200/90`;
}
