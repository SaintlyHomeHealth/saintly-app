import type { InsurancePayer } from "@/lib/crm/insurance-payer-types";

/** Aligns with server list order: non-null sort_order first (asc), nulls last, then payer_name. */
export function sortInsurancePayerListItems(items: InsurancePayer[]): InsurancePayer[] {
  return [...items].sort((a, b) => {
    const ao = a.sort_order;
    const bo = b.sort_order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return a.payer_name.localeCompare(b.payer_name, undefined, { sensitivity: "base" });
  });
}

/** Merge DB catalog order with type-specific suggestions without duplicate normalized names. */
export function mergeInsurancePayerCatalogWithTypeOptions(
  catalog: InsurancePayer[],
  typeOptions: readonly string[]
): string[] {
  const normSeen = new Set(catalog.map((c) => c.normalized_name));
  const ordered = catalog.map((c) => c.payer_name.trim()).filter(Boolean);
  const extras: string[] = [];
  for (const opt of typeOptions) {
    const d = opt.trim();
    if (!d) continue;
    const n = d.toLowerCase();
    if (!normSeen.has(n)) {
      normSeen.add(n);
      extras.push(d);
    }
  }
  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...ordered, ...extras];
}

export function insurancePayerOptionListHasNormalizedMatch(options: readonly string[], typed: string): boolean {
  const t = typed.trim().toLowerCase();
  if (!t) return false;
  return options.some((o) => o.trim().toLowerCase() === t);
}
