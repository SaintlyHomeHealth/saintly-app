"use client";

import { useRouter } from "next/navigation";

import { buildAdminCrmLeadsHref } from "@/lib/crm/admin-crm-leads-list-url";

const LS_KEY = "crm-leads-list-density";

type Props = {
  density: "compact" | "comfortable";
};

/**
 * Rows read `initialDensity` from the URL (SSR). This control updates URL + localStorage without affecting filters.
 */
export function CrmLeadsDensityToggle({ density }: Props) {
  const router = useRouter();

  const setDensity = (next: "compact" | "comfortable") => {
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* ignore */
    }
    if (typeof window === "undefined") return;

    const u = new URL(window.location.href);
    const qs = Object.fromEntries(u.searchParams.entries());
    const merged = buildAdminCrmLeadsHref({
      status: qs.status ?? "",
      source: qs.source ?? "",
      owner: qs.owner ?? "",
      followUp: qs.followUp ?? "",
      payerType: qs.payerType ?? "",
      discipline: qs.discipline ?? "",
      leadType: qs.leadType ?? "",
      q: qs.q ?? "",
      showDead: qs.showDead === "1",
      page: Math.max(1, Number.parseInt(qs.page ?? "1", 10) || 1),
      density: next === "compact" ? "compact" : "comfortable",
    });

    router.replace(merged);
  };

  const btn =
    "rounded-md px-2 py-1 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Density</span>
      <button
        type="button"
        className={`${btn} ${density === "compact" ? "border border-sky-200 bg-sky-50 text-sky-900" : "text-slate-600 hover:bg-slate-50"}`}
        aria-pressed={density === "compact"}
        onClick={() => setDensity("compact")}
      >
        Compact
      </button>
      <button
        type="button"
        className={`${btn} ${density === "comfortable" ? "border border-sky-200 bg-sky-50 text-sky-900" : "text-slate-600 hover:bg-slate-50"}`}
        aria-pressed={density === "comfortable"}
        onClick={() => setDensity("comfortable")}
      >
        Comfortable
      </button>
    </div>
  );
}
