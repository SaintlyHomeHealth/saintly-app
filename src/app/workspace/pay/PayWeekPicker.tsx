"use client";

import { useRouter } from "next/navigation";

type WeekOpt = { start: string; end: string };

export function PayWeekPicker({
  selectedWeekStart,
  currentPeriodWeekStart,
  currentPeriodWeekEnd,
  weeks,
}: {
  selectedWeekStart: string;
  currentPeriodWeekStart: string;
  /** Sunday for the active pay week; improves labels when this period is not in `weeks` yet. */
  currentPeriodWeekEnd?: string;
  weeks: WeekOpt[];
}) {
  const router = useRouter();
  const seen = new Set<string>();
  const opts: WeekOpt[] = [];
  for (const w of weeks) {
    const s = w.start;
    if (!s || seen.has(s)) continue;
    seen.add(s);
    opts.push({ start: s, end: w.end || s });
  }
  if (!seen.has(currentPeriodWeekStart)) {
    const end = currentPeriodWeekEnd ?? currentPeriodWeekStart;
    opts.unshift({ start: currentPeriodWeekStart, end });
  }
  opts.sort((a, b) => b.start.localeCompare(a.start));

  return (
    <label className="block max-w-md text-xs font-semibold text-slate-600">
      Pay week
      <select
        value={selectedWeekStart}
        onChange={(e) => {
          const v = e.target.value;
          router.replace(
            v && v !== currentPeriodWeekStart ? `/workspace/pay?week=${encodeURIComponent(v)}` : "/workspace/pay"
          );
        }}
        className="mt-1.5 w-full rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 shadow-inner shadow-slate-950/5"
      >
        {opts.map((w) => (
          <option key={w.start} value={w.start}>
            {w.start} – {w.end}
          </option>
        ))}
      </select>
    </label>
  );
}
