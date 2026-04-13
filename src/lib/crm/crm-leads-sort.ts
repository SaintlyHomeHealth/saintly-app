import { leadTemperatureSortRank } from "./lead-temperature";
import type { CrmLeadRow } from "./crm-leads-table-helpers";

/**
 * Default list ordering: newest leads first (`created_at` descending), then stable `id` tie-break.
 * When `showDead` is true, dead leads sort last within the list.
 * Within the same `created_at` second, Hot/Warm sort before unset/cool/dead for triage.
 */
export function sortLeadsForPipelineDefault(rows: CrmLeadRow[], _todayIso: string, showDead: boolean): CrmLeadRow[] {
  return [...rows].sort((a, b) => {
    const da = (a.status ?? "").trim().toLowerCase() === "dead_lead";
    const db = (b.status ?? "").trim().toLowerCase() === "dead_lead";
    if (showDead && da !== db) return da ? 1 : -1;

    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return tb - ta;

    const ra = leadTemperatureSortRank(a.lead_temperature);
    const rb = leadTemperatureSortRank(b.lead_temperature);
    if (ra !== rb) return ra - rb;

    return String(b.id).localeCompare(String(a.id));
  });
}
