import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Common payer keywords (merged with values seen on leads for the filter datalist).
 * Partial `payer` URL matches against intake payer columns via ilike.
 */
export const ADMIN_CRM_LEADS_PAYER_KEYWORD_PRESETS: string[] = [
  "Aetna",
  "AHCCCS",
  "Anthem",
  "BCBS",
  "Blue Cross",
  "Blue Cross Blue Shield",
  "Cigna",
  "Humana",
  "Kaiser",
  "Medicaid",
  "Medicare",
  "Molina",
  "Self-pay",
  "Self pay",
  "Tricare",
  "UHC",
  "United",
  "United Healthcare",
  "Wellcare",
];

const PAYER_HARVEST_COLS = [
  "payer_name",
  "primary_payer_name",
  "secondary_payer_name",
  "payer_type",
  "primary_payer_type",
  "secondary_payer_type",
] as const;

/**
 * Distinct-ish payer strings from recent lead rows + presets (cap ~120 for datalist).
 */
export async function harvestLeadsPayerFilterSuggestions(supabase: SupabaseClient): Promise<string[]> {
  const out: string[] = [...ADMIN_CRM_LEADS_PAYER_KEYWORD_PRESETS];
  const seen = new Set(out.map((s) => s.toLowerCase()));

  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const t = raw.trim();
    if (t.length < 2 || t.length > 140) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  for (const col of PAYER_HARVEST_COLS) {
    const { data } = await leadRowsActiveOnly(
      supabase.from("leads").select(col).not(col, "is", null).neq(col, "").limit(350)
    );
    for (const row of data ?? []) push((row as Record<string, unknown>)[col]);
    if (out.length >= 160) break;
  }

  return out
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .slice(0, 120);
}
