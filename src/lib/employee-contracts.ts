export type ContractRoleKey = "rn" | "lvn" | "pt" | "st" | "msw" | "hha";
export type EmploymentClassification = "employee" | "contractor";
export type EmploymentType = "prn" | "part_time" | "full_time";
export type PayType = "per_visit" | "hourly" | "salary";
export type MileageType = "none" | "per_mile";
export type ContractStatus = "draft" | "sent" | "signed" | "void";

export type PtPerVisitRateKey =
  | "soc"
  | "dc_roc_recert_oasis"
  | "pt_eval"
  | "pt_visit"
  | "pta";

export type PtPerVisitRates = Record<PtPerVisitRateKey, number | null>;

export const PT_PER_VISIT_RATE_FIELDS: ReadonlyArray<{
  key: PtPerVisitRateKey;
  label: string;
}> = [
  { key: "soc", label: "SOC" },
  { key: "dc_roc_recert_oasis", label: "DC / ROC / Recert OASIS" },
  { key: "pt_eval", label: "PT Eval" },
  { key: "pt_visit", label: "PT Visit" },
  { key: "pta", label: "PTA" },
];

export const EMPTY_PT_PER_VISIT_RATES: PtPerVisitRates = {
  soc: null,
  dc_roc_recert_oasis: null,
  pt_eval: null,
  pt_visit: null,
  pta: null,
};

/** RN agreement schedule stored in the same per_visit_rates JSON column. */
export type RnPerVisitRateKey = "visit" | "soc" | "tango";

export type RnPerVisitRates = Record<RnPerVisitRateKey, number | null>;

export const RN_PER_VISIT_RATE_FIELDS: ReadonlyArray<{
  key: RnPerVisitRateKey;
  label: string;
  hint?: string;
}> = [
  { key: "visit", label: "Visit" },
  { key: "soc", label: "SOC" },
  { key: "tango", label: "Tango", hint: "Optional override (e.g. Tim / Victoria)" },
];

export const EMPTY_RN_PER_VISIT_RATES: RnPerVisitRates = {
  visit: null,
  soc: null,
  tango: null,
};

export type EmployeeContractRow = {
  id: string;
  applicant_id: string;
  role_key: ContractRoleKey;
  role_label: string;
  employment_classification: EmploymentClassification;
  employment_type: EmploymentType;
  pay_type: PayType;
  pay_rate: number;
  per_visit_rates?: PtPerVisitRates | RnPerVisitRates | null;
  mileage_type: MileageType;
  mileage_rate: number | null;
  effective_date: string;
  contract_status: ContractStatus;
  contract_text_snapshot: string;
  admin_prepared_by: string | null;
  admin_prepared_at: string | null;
  employee_signed_name: string | null;
  employee_signed_at: string | null;
  /** Per (applicant_id, employment_classification); see migration employee_contracts_applicant_agreement_version_unique */
  version_number?: number | null;
  is_current?: boolean | null;
  created_at: string;
  updated_at: string;
};

/** PostgREST select for admin contract lists and client history fetches (avoid `select("*")`). */
export const EMPLOYEE_CONTRACT_ADMIN_LIST_COLUMNS =
  "id, applicant_id, role_key, role_label, employment_classification, employment_type, pay_type, pay_rate, per_visit_rates, mileage_type, mileage_rate, effective_date, contract_status, contract_text_snapshot, admin_prepared_by, admin_prepared_at, employee_signed_name, employee_signed_at, created_at, updated_at, version_number, is_current";

type ContractRoleConfig = {
  key: ContractRoleKey;
  label: string;
  title: string;
  duties: string[];
  qualifications: string[];
};

const ROLE_CONFIG: Record<ContractRoleKey, ContractRoleConfig> = {
  rn: {
    key: "rn",
    label: "RN",
    title: "Registered Nurse",
    duties: [
      "Provide skilled nursing visits, patient assessments, and clinical coordination in the home setting.",
      "Develop, update, and carry out patient care plans consistent with physician orders and agency standards.",
      "Complete visit documentation, patient education, and care communication in a timely and accurate manner.",
    ],
    qualifications: [
      "Maintain an active professional license and any required certifications for the role.",
      "Complete agency onboarding, training, HIPAA, and competency requirements.",
    ],
  },
  lvn: {
    key: "lvn",
    label: "LVN",
    title: "Licensed Vocational Nurse",
    duties: [
      "Provide skilled nursing tasks and treatments as permitted under state law and agency policy.",
      "Observe, report, and document patient condition, response to care, and changes needing escalation.",
      "Assist with medication administration, wound care, treatments, and patient/caregiver instruction under appropriate supervision.",
      "Collaborate with the supervising RN and interdisciplinary team to support continuity of care.",
      "Complete visit documentation, patient education, and care communication in a timely and accurate manner.",
    ],
    qualifications: [
      "Maintain an active LVN/LPN license and any required certifications for the role.",
      "Complete agency onboarding, training, HIPAA, and competency requirements.",
    ],
  },
  pt: {
    key: "pt",
    label: "PT",
    title: "Physical Therapist",
    duties: [
      "Perform evaluations and provide therapy interventions that support mobility, strength, balance, and safety in the home.",
      "Create and update treatment plans based on physician orders, patient goals, and clinical findings.",
      "Educate patients and caregivers while documenting progress and discharge planning promptly.",
    ],
    qualifications: [
      "Maintain an active professional license and any required certifications for the role.",
      "Complete agency onboarding, training, HIPAA, and competency requirements.",
    ],
  },
  st: {
    key: "st",
    label: "ST",
    title: "Speech Therapist",
    duties: [
      "Evaluate and treat communication, cognitive, and swallowing needs in accordance with the plan of care.",
      "Provide patient and caregiver education related to therapy goals, safety, and home-based carryover.",
      "Document assessments, visits, progress, and care coordination accurately and on time.",
    ],
    qualifications: [
      "Maintain an active professional license and any required certifications for the role.",
      "Complete agency onboarding, training, HIPAA, and competency requirements.",
    ],
  },
  msw: {
    key: "msw",
    label: "MSW",
    title: "Medical Social Worker",
    duties: [
      "Assess psychosocial, environmental, and support-system needs that affect patient care in the home.",
      "Provide counseling, resource coordination, and care-planning support as appropriate.",
      "Communicate findings and recommendations with the interdisciplinary team and document services promptly.",
    ],
    qualifications: [
      "Maintain any required licensure, registration, or credentials applicable to the role.",
      "Complete agency onboarding, training, HIPAA, and competency requirements.",
    ],
  },
  hha: {
    key: "hha",
    label: "HHA",
    title: "Home Health Aide",
    duties: [
      "Provide assigned personal care and support services in accordance with the aide care plan and agency direction.",
      "Observe and report changes in patient condition, functioning, or home safety concerns to the supervising clinician.",
      "Document assigned care tasks and visit details accurately and in a timely manner.",
    ],
    qualifications: [
      "Maintain any required certifications, health clearances, and in-service training for the role.",
      "Complete agency onboarding, training, HIPAA, and competency requirements.",
    ],
  },
};

export const CONTRACT_ROLE_OPTIONS = Object.values(ROLE_CONFIG).map((role) => ({
  value: role.key,
  label: role.label,
  title: role.title,
}));

export function getContractRoleConfig(roleKey: ContractRoleKey) {
  return ROLE_CONFIG[roleKey];
}

export function inferContractRoleFromText(value?: string | null): ContractRoleKey | "" {
  const normalized = (value || "").toLowerCase().trim();

  if (!normalized) return "";
  if (normalized === "rn" || normalized.includes("registered nurse")) return "rn";
  if (
    normalized === "lvn" ||
    normalized === "lpn" ||
    normalized.includes("licensed practical nurse") ||
    normalized.includes("licensed vocational nurse")
  ) {
    return "lvn";
  }
  if (
    normalized === "pt" ||
    normalized.includes("physical therapist") ||
    normalized.includes("physical therapy")
  ) {
    return "pt";
  }
  if (
    normalized === "st" ||
    normalized.includes("speech therapist") ||
    normalized.includes("speech language")
  ) {
    return "st";
  }
  if (normalized === "msw" || normalized.includes("medical social worker")) return "msw";
  if (
    normalized === "hha" ||
    normalized.includes("home health aide") ||
    normalized.includes("caregiver") ||
    normalized.includes("cna") ||
    normalized.includes("certified nursing assistant") ||
    normalized.includes("nursing assistant") ||
    normalized.includes("direct support") ||
    normalized.includes("dsp") ||
    normalized.includes("pca") ||
    normalized.includes("personal care aide") ||
    normalized.includes("chha")
  ) {
    return "hha";
  }

  return "";
}

export function formatEmploymentTypeLabel(value: EmploymentType) {
  switch (value) {
    case "part_time":
      return "Part-time";
    case "full_time":
      return "Full-time";
    default:
      return "PRN";
  }
}

export function formatEmploymentClassificationLabel(value: EmploymentClassification) {
  return value === "contractor" ? "Contractor" : "Employee";
}

export function getEmploymentAgreementTitle(value: EmploymentClassification) {
  return value === "employee"
    ? "W-2 Employment Agreement"
    : "Independent Contractor Agreement";
}

export function formatPayTypeLabel(value: PayType) {
  switch (value) {
    case "hourly":
      return "Hourly";
    case "salary":
      return "Salary";
    default:
      return "Per Visit";
  }
}

export function formatMileageTypeLabel(value: MileageType) {
  return value === "per_mile" ? "Per Mile" : "No Mileage";
}

export function formatCurrency(value?: number | string | null) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function isPtPerVisitContract(roleKey: ContractRoleKey | "", payType: PayType) {
  return roleKey === "pt" && payType === "per_visit";
}

export function isRnPerVisitContract(roleKey: ContractRoleKey | "", payType: PayType) {
  return roleKey === "rn" && payType === "per_visit";
}

export function parsePtPerVisitRates(value: unknown): PtPerVisitRates | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  // RN schedules reuse the same JSON column and may include "soc"; do not treat as PT.
  if ("visit" in record || "tango" in record) {
    return null;
  }

  const parsed: PtPerVisitRates = { ...EMPTY_PT_PER_VISIT_RATES };
  let hasAnyRate = false;

  for (const field of PT_PER_VISIT_RATE_FIELDS) {
    const raw = record[field.key];
    if (raw === null || raw === undefined || raw === "") {
      parsed[field.key] = null;
      continue;
    }

    const numericValue = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return null;
    }

    parsed[field.key] = numericValue;
    hasAnyRate = true;
  }

  return hasAnyRate ? parsed : null;
}

export function hasPtPerVisitRates(value?: PtPerVisitRates | null) {
  if (!value) return false;
  return PT_PER_VISIT_RATE_FIELDS.some((field) => {
    const rate = value[field.key];
    return typeof rate === "number" && Number.isFinite(rate);
  });
}

export function ptPerVisitRatesFromFormStrings(input: Record<PtPerVisitRateKey, string>): PtPerVisitRates {
  const rates: PtPerVisitRates = { ...EMPTY_PT_PER_VISIT_RATES };

  for (const field of PT_PER_VISIT_RATE_FIELDS) {
    const trimmed = input[field.key].trim();
    if (!trimmed) continue;

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      rates[field.key] = numericValue;
    }
  }

  return rates;
}

export function ptPerVisitRatesToFormStrings(
  rates?: PtPerVisitRates | null
): Record<PtPerVisitRateKey, string> {
  const formValues = {} as Record<PtPerVisitRateKey, string>;

  for (const field of PT_PER_VISIT_RATE_FIELDS) {
    const rate = rates?.[field.key];
    formValues[field.key] = typeof rate === "number" && Number.isFinite(rate) ? String(rate) : "";
  }

  return formValues;
}

export function resolveLegacyPayRateForPtPerVisit(
  payRate: number,
  perVisitRates?: PtPerVisitRates | null
) {
  if (hasPtPerVisitRates(perVisitRates)) {
    const ptVisit = perVisitRates?.pt_visit;
    if (typeof ptVisit === "number" && Number.isFinite(ptVisit)) {
      return ptVisit;
    }

    for (const field of PT_PER_VISIT_RATE_FIELDS) {
      const rate = perVisitRates?.[field.key];
      if (typeof rate === "number" && Number.isFinite(rate)) {
        return rate;
      }
    }
  }

  return payRate;
}

export function parseRnPerVisitRates(value: unknown): RnPerVisitRates | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const parsed: RnPerVisitRates = { ...EMPTY_RN_PER_VISIT_RATES };
  let hasAnyRate = false;

  for (const field of RN_PER_VISIT_RATE_FIELDS) {
    const raw = record[field.key];
    if (raw === null || raw === undefined || raw === "") {
      parsed[field.key] = null;
      continue;
    }

    const numericValue = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return null;
    }

    parsed[field.key] = numericValue;
    hasAnyRate = true;
  }

  // PT schedules also have "soc"; only treat as RN when visit/tango present (or soc alone with visit key).
  if (!hasAnyRate) return null;
  if (parsed.visit == null && parsed.tango == null && parsed.soc != null && "pt_visit" in record) {
    return null;
  }
  if (parsed.visit == null && parsed.tango == null && parsed.soc != null && !("visit" in record)) {
    return null;
  }

  return parsed;
}

export function hasRnPerVisitRates(value?: RnPerVisitRates | null) {
  if (!value) return false;
  return RN_PER_VISIT_RATE_FIELDS.some((field) => {
    const rate = value[field.key];
    return typeof rate === "number" && Number.isFinite(rate);
  });
}

export function rnPerVisitRatesFromFormStrings(input: Record<RnPerVisitRateKey, string>): RnPerVisitRates {
  const rates: RnPerVisitRates = { ...EMPTY_RN_PER_VISIT_RATES };

  for (const field of RN_PER_VISIT_RATE_FIELDS) {
    const trimmed = input[field.key].trim();
    if (!trimmed) continue;

    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      rates[field.key] = numericValue;
    }
  }

  return rates;
}

export function rnPerVisitRatesToFormStrings(
  rates?: RnPerVisitRates | null,
  fallbackVisitRate?: number | null
): Record<RnPerVisitRateKey, string> {
  const formValues = {} as Record<RnPerVisitRateKey, string>;

  for (const field of RN_PER_VISIT_RATE_FIELDS) {
    const rate = rates?.[field.key];
    formValues[field.key] = typeof rate === "number" && Number.isFinite(rate) ? String(rate) : "";
  }

  if (
    !formValues.visit &&
    typeof fallbackVisitRate === "number" &&
    Number.isFinite(fallbackVisitRate)
  ) {
    formValues.visit = String(fallbackVisitRate);
  }

  return formValues;
}

export function resolveLegacyPayRateForRnPerVisit(
  payRate: number,
  perVisitRates?: RnPerVisitRates | null
) {
  if (hasRnPerVisitRates(perVisitRates)) {
    const visit = perVisitRates?.visit;
    if (typeof visit === "number" && Number.isFinite(visit)) {
      return visit;
    }

    for (const field of RN_PER_VISIT_RATE_FIELDS) {
      const rate = perVisitRates?.[field.key];
      if (typeof rate === "number" && Number.isFinite(rate)) {
        return rate;
      }
    }
  }

  return payRate;
}

export function buildPtPerVisitCompensationSection(rates: PtPerVisitRates) {
  const lines = PT_PER_VISIT_RATE_FIELDS.map((field) => {
    const rate = rates[field.key];
    const formattedRate =
      typeof rate === "number" && Number.isFinite(rate) ? formatCurrency(rate) : "$___";
    return `- ${field.label}: ${formattedRate} per visit`;
  });

  return ["Compensation:", ...lines].join("\n");
}

export function buildRnPerVisitCompensationSection(rates: RnPerVisitRates) {
  const lines = RN_PER_VISIT_RATE_FIELDS.map((field) => {
    const rate = rates[field.key];
    const formattedRate =
      typeof rate === "number" && Number.isFinite(rate) ? formatCurrency(rate) : "$___";
    const suffix = field.key === "tango" && rate == null ? " (if applicable)" : "";
    return `- ${field.label}: ${formattedRate} per visit${suffix}`;
  });

  return ["Compensation:", ...lines].join("\n");
}

export function formatContractPaySummary(input: {
  roleKey: ContractRoleKey;
  payType: PayType;
  payRate: number;
  perVisitRates?: PtPerVisitRates | RnPerVisitRates | null;
}) {
  if (
    isPtPerVisitContract(input.roleKey, input.payType) &&
    hasPtPerVisitRates(input.perVisitRates as PtPerVisitRates | null)
  ) {
    return "PT Per Visit Rates";
  }

  if (
    isRnPerVisitContract(input.roleKey, input.payType) &&
    hasRnPerVisitRates(parseRnPerVisitRates(input.perVisitRates))
  ) {
    return "RN Per Visit Rates";
  }

  return `${formatPayTypeLabel(input.payType)} ${formatCurrency(input.payRate)}`;
}

export function buildEmployeeContractText(input: {
  roleKey: ContractRoleKey;
  employmentClassification: EmploymentClassification;
  employmentType: EmploymentType;
  payType: PayType;
  payRate: number;
  perVisitRates?: PtPerVisitRates | RnPerVisitRates | null;
  mileageType: MileageType;
  mileageRate: number | null;
  effectiveDate: string;
}) {
  const role = getContractRoleConfig(input.roleKey);
  const usePtPerVisitSchedule =
    isPtPerVisitContract(input.roleKey, input.payType) &&
    hasPtPerVisitRates(input.perVisitRates as PtPerVisitRates | null);
  const rnRates = parseRnPerVisitRates(input.perVisitRates);
  const useRnPerVisitSchedule =
    isRnPerVisitContract(input.roleKey, input.payType) && hasRnPerVisitRates(rnRates);
  const compensationBlocks = usePtPerVisitSchedule
    ? [buildPtPerVisitCompensationSection(input.perVisitRates as PtPerVisitRates)]
    : useRnPerVisitSchedule
      ? [buildRnPerVisitCompensationSection(rnRates!)]
    : [
        "Compensation",
        `${formatPayTypeLabel(input.payType)} compensation will be paid at ${formatCurrency(
          input.payRate
        )}.`,
      ];
  const mileageLine =
    input.mileageType === "per_mile" && input.mileageRate !== null
      ? `Mileage will be reimbursed at ${formatCurrency(input.mileageRate)} per mile for approved work-related travel.`
      : "Mileage reimbursement is not included unless later approved in writing by Saintly Home Health.";

  if (input.employmentClassification === "employee") {
    return [
      `${role.title} W-2 Employment Agreement`,
      `Effective Date: ${input.effectiveDate}`,
      `Role: ${role.title}`,
      `Classification: W2 Employee`,
      `Employment Type: ${formatEmploymentTypeLabel(input.employmentType)}`,
      "Position and Purpose",
      "This W-2 Employment Agreement confirms the employee's role with Saintly Home Health and outlines the core employment terms, compensation structure, and professional expectations that apply to the position.",
      "Scope and Duties",
      ...role.duties.map((duty, index) => `${index + 1}. ${duty}`),
      "Qualifications and Compliance",
      ...role.qualifications.map((item, index) => `${index + 1}. ${item}`),
      "HIPAA and Confidentiality",
      "The employee must protect patient information, agency records, and confidential business information at all times, and must comply with HIPAA, agency privacy standards, and all applicable federal and state requirements.",
      "Insurance and Agency Policies",
      "The employee must maintain all required credentials, health clearances, certifications, and training applicable to the role and comply with Saintly Home Health policies, scheduling practices, documentation standards, and supervisory direction.",
      "Term and Termination",
      "Employment begins on the effective date above and is expected to continue unless changed or ended by the employee or Saintly Home Health in accordance with agency policy and applicable law. Job duties, assignments, territories, and schedules may change based on patient care and operational needs.",
      ...compensationBlocks,
      mileageLine,
      "Compensation, payroll deductions, benefits eligibility, and reimbursements will be administered in accordance with payroll practices, applicable law, and Saintly Home Health policies.",
      "Acknowledgment",
      "By signing, the employee acknowledges review of this W-2 Employment Agreement, accepts the position under the terms listed above, and agrees to perform assigned duties in a professional, compliant, and patient-centered manner.",
    ].join("\n\n");
  }

  return [
    `${role.title} Independent Contractor Agreement`,
    `Effective Date: ${input.effectiveDate}`,
    `Role: ${role.title}`,
    `Classification: ${formatEmploymentClassificationLabel(input.employmentClassification)}`,
    `Employment Type: ${formatEmploymentTypeLabel(input.employmentType)}`,
    "Purpose",
    "This Independent Contractor Agreement sets out the initial engagement terms for the role listed above with Saintly Home Health. It is intended to confirm the contractor relationship, compensation structure, and baseline expectations for professional conduct and compliance.",
    "Scope and Duties",
    ...role.duties.map((duty, index) => `${index + 1}. ${duty}`),
    "Qualifications and Compliance",
    ...role.qualifications.map((item, index) => `${index + 1}. ${item}`),
    "HIPAA and Confidentiality",
    "The employee or contractor must protect patient information, business records, and any confidential information obtained through work with Saintly Home Health, and must comply with HIPAA, agency privacy requirements, and all applicable laws and policies.",
    "Insurance and Indemnification",
    "The worker agrees to maintain any required professional coverage, credentials, and legal qualifications applicable to the role. Each party remains responsible for its own acts and omissions to the extent permitted by law and applicable insurance coverage.",
    "Term and Termination",
    "This agreement begins on the effective date above and continues until modified or ended by either party in accordance with agency policy, applicable law, and any required notice obligations. Saintly Home Health may update assignments, schedules, and expectations based on operational needs.",
    ...compensationBlocks,
    mileageLine,
    "All compensation and reimbursements are subject to applicable payroll practices, documentation standards, and agency approval requirements.",
    "Acknowledgment",
    "By signing, the contractor confirms review of this Independent Contractor Agreement, understands the role expectations, and agrees to perform services in a professional and compliant manner for Saintly Home Health.",
  ].join("\n\n");
}
