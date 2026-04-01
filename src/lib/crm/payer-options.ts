/**
 * Arizona-focused payer labels for CRM intake. Selected value is stored in `patients.payer_name` / `leads.payer_name`.
 * Add or reorder entries here; UI reads from this module only.
 */
export const ARIZONA_PAYER_OPTIONS: readonly string[] = [
  // Medicare / Medicare-related
  "Medicare (Original Medicare)",
  "Medicare Railroad",
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
  // Arizona Medicaid / AHCCCS-related
  "AHCCCS Complete Care - Banner University Family Care",
  "AHCCCS Complete Care - Molina Healthcare",
  "AHCCCS Complete Care - Blue Cross Blue Shield of Arizona Health Choice",
  "AHCCCS Complete Care - Arizona Complete Health",
  "AHCCCS Complete Care - Mercy Care",
  "AHCCCS Complete Care - UnitedHealthcare Community Plan",
  "American Indian Health Program (AIHP)",
  "ALTCS / DDD",
] as const;

export const PAYER_OPTIONS_GROUPED: readonly { label: string; options: readonly string[] }[] = [
  {
    label: "Medicare / Medicare-related",
    options: ARIZONA_PAYER_OPTIONS.slice(0, 16),
  },
  {
    label: "Arizona Medicaid / AHCCCS-related",
    options: ARIZONA_PAYER_OPTIONS.slice(16),
  },
];
