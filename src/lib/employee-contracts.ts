export type ContractRoleKey = "rn" | "pt" | "st" | "msw" | "hha";
export type EmploymentClassification = "employee" | "contractor";
export type EmploymentType = "prn" | "part_time" | "full_time";
export type PayType = "per_visit" | "hourly" | "salary";
export type MileageType = "none" | "per_mile";
export type ContractStatus = "draft" | "sent" | "signed" | "void";

export type EmployeeContractRow = {
  id: string;
  applicant_id: string;
  role_key: ContractRoleKey;
  role_label: string;
  employment_classification: EmploymentClassification;
  employment_type: EmploymentType;
  pay_type: PayType;
  pay_rate: number;
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

export function buildEmployeeContractText(input: {
  roleKey: ContractRoleKey;
  employmentClassification: EmploymentClassification;
  employmentType: EmploymentType;
  payType: PayType;
  payRate: number;
  mileageType: MileageType;
  mileageRate: number | null;
  effectiveDate: string;
}) {
  const role = getContractRoleConfig(input.roleKey);
  const compensationLine = `${formatPayTypeLabel(input.payType)} compensation will be paid at ${formatCurrency(
    input.payRate
  )}.`;
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
      "Compensation",
      compensationLine,
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
    "Compensation",
    compensationLine,
    mileageLine,
    "All compensation and reimbursements are subject to applicable payroll practices, documentation standards, and agency approval requirements.",
    "Acknowledgment",
    "By signing, the contractor confirms review of this Independent Contractor Agreement, understands the role expectations, and agrees to perform services in a professional and compliant manner for Saintly Home Health.",
  ].join("\n\n");
}
