/**
 * Arizona-focused payer labels for CRM intake. Selected value is stored in `patients.payer_name` / `leads.payer_*`.
 * Lead insurance fields use {@link getPayerNameOptionsForLeadStructuredType} so suggestions match the selected payer type.
 */

/** Default primary payer name when payer type is Original Medicare. */
export const ORIGINAL_MEDICARE_DEFAULT_PAYER_NAME = "Medicare (Original Medicare)" as const;

/** Supplement & commercial — plain carrier names (not Medicare Advantage plan labels). */
export const SUPPLEMENT_AND_COMMERCIAL_CARRIER_OPTIONS: readonly string[] = [
  "UnitedHealthcare",
  "AARP / UnitedHealthcare",
  "Blue Cross Blue Shield",
  "Blue Cross Blue Shield of Arizona",
  "Humana",
  "Aetna",
  "Cigna",
  "Mutual of Omaha",
  "State Farm",
  "Globe Life",
  "Other",
] as const;

/** Medicare Advantage — plan / program labels. */
export const MEDICARE_ADVANTAGE_PAYER_NAME_OPTIONS: readonly string[] = [
  "UnitedHealthcare Medicare Advantage",
  "Humana Medicare Advantage",
  "Aetna Medicare Advantage",
  "Blue Cross Blue Shield of Arizona Medicare Advantage",
  "Cigna / HealthSpring Medicare Advantage",
  "Wellcare Medicare Advantage",
  "Banner Medicare Advantage",
  "Alignment Health Plan Medicare Advantage",
  "SCAN Health Plan Medicare Advantage",
  "Devoted Health Medicare Advantage",
  "Mercy Care Advantage",
  "Molina Medicare Complete Care",
  "Arizona Complete Health Medicare Advantage",
  "Health Choice Pathway Medicare Advantage",
] as const;

export const ORIGINAL_MEDICARE_PAYER_NAME_OPTIONS: readonly string[] = [
  ORIGINAL_MEDICARE_DEFAULT_PAYER_NAME,
  "Medicare Railroad",
] as const;

/** Medicaid / AHCCCS-style — short labels plus legacy “Complete Care” strings for backwards-compatible suggestions. */
export const MEDICAID_PAYER_NAME_OPTIONS: readonly string[] = [
  "AHCCCS",
  "Arizona Complete Health",
  "Mercy Care",
  "Molina",
  "Banner University Family Care",
  "Blue Cross Blue Shield of Arizona Health Choice",
  "UnitedHealthcare Community Plan",
  "American Indian Health Program (AIHP)",
  "AHCCCS Complete Care - Banner University Family Care",
  "AHCCCS Complete Care - Molina Healthcare",
  "AHCCCS Complete Care - Blue Cross Blue Shield of Arizona Health Choice",
  "AHCCCS Complete Care - Arizona Complete Health",
  "AHCCCS Complete Care - Mercy Care",
  "AHCCCS Complete Care - UnitedHealthcare Community Plan",
  "ALTCS / DDD",
  "Other",
] as const;

function dedupeSorted(options: readonly string[]): string[] {
  return [...new Set(options.map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Union of all curated suggestions (patient intake + “other” type on leads). */
export const ALL_PAYER_NAME_SUGGESTIONS: readonly string[] = dedupeSorted([
  ...ORIGINAL_MEDICARE_PAYER_NAME_OPTIONS,
  ...MEDICARE_ADVANTAGE_PAYER_NAME_OPTIONS,
  ...MEDICAID_PAYER_NAME_OPTIONS,
  ...SUPPLEMENT_AND_COMMERCIAL_CARRIER_OPTIONS,
]);

/**
 * Suggested payer names for a lead structured payer type (`leads.primary_payer_type` / `secondary_payer_type`).
 */
export function getPayerNameOptionsForLeadStructuredType(structuredType: string): readonly string[] {
  const t = structuredType.trim();
  switch (t) {
    case "original_medicare":
      return ORIGINAL_MEDICARE_PAYER_NAME_OPTIONS;
    case "medicare_advantage":
      return MEDICARE_ADVANTAGE_PAYER_NAME_OPTIONS;
    case "medicaid":
      return MEDICAID_PAYER_NAME_OPTIONS;
    case "supplement":
    case "commercial":
      return SUPPLEMENT_AND_COMMERCIAL_CARRIER_OPTIONS;
    case "other":
      return ALL_PAYER_NAME_SUGGESTIONS;
    default:
      return ALL_PAYER_NAME_SUGGESTIONS;
  }
}

/** @deprecated Use {@link ALL_PAYER_NAME_SUGGESTIONS} — kept for existing imports. */
export const ARIZONA_PAYER_OPTIONS: readonly string[] = ALL_PAYER_NAME_SUGGESTIONS;

export const PAYER_OPTIONS_GROUPED: readonly { label: string; options: readonly string[] }[] = [
  { label: "Original Medicare", options: ORIGINAL_MEDICARE_PAYER_NAME_OPTIONS },
  { label: "Medicare Advantage", options: MEDICARE_ADVANTAGE_PAYER_NAME_OPTIONS },
  { label: "Medicaid / AHCCCS", options: MEDICAID_PAYER_NAME_OPTIONS },
  { label: "Supplement / commercial", options: SUPPLEMENT_AND_COMMERCIAL_CARRIER_OPTIONS },
];

/** Ensures the current (possibly legacy/custom) value appears in the datalist. */
export function mergePayerNameSuggestions(options: readonly string[], currentValue: string): string[] {
  const v = currentValue.trim();
  const set = new Set<string>(options);
  if (v) set.add(v);
  return [...set].sort((a, b) => a.localeCompare(b));
}
