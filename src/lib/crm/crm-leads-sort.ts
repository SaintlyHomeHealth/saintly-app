import type { CrmLeadRow } from "./crm-leads-table-helpers";

/** Follow-up urgency for default list ordering (lower = higher priority). */
function followUpRank(iso: string | null | undefined, todayIso: string): number {
  const d = typeof iso === "string" ? iso.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 4;
  if (d < todayIso) return 0;
  if (d === todayIso) return 1;
  return 2;
}

/** Derived pipeline heat for sorting (lower = surface earlier). */
function heatRank(row: CrmLeadRow, todayIso: string): number {
  const s = (row.status ?? "").trim().toLowerCase();
  if (s === "dead_lead") return 99;
  if (s === "converted") return 50;
  const fu = row.follow_up_date?.slice(0, 10) ?? "";
  if (fu && fu <= todayIso && s !== "converted") return 0;
  if (s === "ready_to_convert" || s === "intake_in_progress") return 1;
  if (s === "attempted_contact" || s === "waiting_on_referral" || s === "waiting_on_documents") return 2;
  if (s === "new" || s === "new_applicant") return 3;
  return 4;
}

/**
 * Default pipeline ordering: overdue/today follow-ups first, then active heat, then recency.
 * When `showDead` is true, dead leads sort last within the list.
 */
export function sortLeadsForPipelineDefault(rows: CrmLeadRow[], todayIso: string, showDead: boolean): CrmLeadRow[] {
  return [...rows].sort((a, b) => {
    const da = (a.status ?? "").trim().toLowerCase() === "dead_lead";
    const db = (b.status ?? "").trim().toLowerCase() === "dead_lead";
    if (showDead && da !== db) return da ? 1 : -1;

    const fa = followUpRank(a.follow_up_date, todayIso);
    const fb = followUpRank(b.follow_up_date, todayIso);
    if (fa !== fb) return fa - fb;

    const ha = heatRank(a, todayIso);
    const hb = heatRank(b, todayIso);
    if (ha !== hb) return ha - hb;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
