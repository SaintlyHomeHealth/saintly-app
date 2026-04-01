import { EmploymentClassification } from "@/lib/employee-contracts";

export type EmployeeTaxFormType = "w4" | "w9";
export type EmployeeTaxFormStatus = "draft" | "sent" | "completed" | "superseded" | "void";

export type W4FormData = {
  first_name: string;
  middle_initial: string;
  last_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ssn: string;
  filing_status: string;
  multiple_jobs: boolean;
  dependents_amount: string;
  other_income: string;
  deductions: string;
  extra_withholding: string;
  signature_name: string;
  signed_date: string;
};

export type W9FormData = {
  full_name: string;
  business_name: string;
  federal_tax_classification: string;
  exempt_payee_code: string;
  exempt_fatca_code: string;
  address: string;
  city_state_zip: string;
  taxpayer_identification_number: string;
  tin_type: "" | "ssn" | "ein";
  certification: boolean;
  signature_name: string;
  signed_date: string;
};

export type EmployeeTaxFormData = W4FormData | W9FormData;

export type EmployeeTaxFormRow = {
  id: string;
  applicant_id: string;
  form_type: EmployeeTaxFormType;
  form_status: EmployeeTaxFormStatus;
  version_number: number;
  is_current: boolean;
  superseded_form_id: string | null;
  employment_classification: EmploymentClassification;
  form_data: EmployeeTaxFormData | Record<string, unknown>;
  admin_sent_by: string | null;
  admin_sent_at: string | null;
  employee_signed_name: string | null;
  employee_signed_at: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_W4_FORM_DATA: W4FormData = {
  first_name: "",
  middle_initial: "",
  last_name: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  ssn: "",
  filing_status: "",
  multiple_jobs: false,
  dependents_amount: "",
  other_income: "",
  deductions: "",
  extra_withholding: "",
  signature_name: "",
  signed_date: "",
};

const EMPTY_W9_FORM_DATA: W9FormData = {
  full_name: "",
  business_name: "",
  federal_tax_classification: "",
  exempt_payee_code: "",
  exempt_fatca_code: "",
  address: "",
  city_state_zip: "",
  taxpayer_identification_number: "",
  tin_type: "",
  certification: false,
  signature_name: "",
  signed_date: "",
};

export function getTaxFormTypeForClassification(
  classification?: EmploymentClassification | null
): EmployeeTaxFormType | null {
  if (classification === "employee") return "w4";
  if (classification === "contractor") return "w9";
  return null;
}

export function getTaxFormLabel(formType: EmployeeTaxFormType) {
  return formType === "w4" ? "W-4" : "W-9";
}

export function getEmptyTaxFormData(formType: EmployeeTaxFormType): EmployeeTaxFormData {
  return formType === "w4" ? { ...EMPTY_W4_FORM_DATA } : { ...EMPTY_W9_FORM_DATA };
}

export function normalizeTaxFormData(formType: EmployeeTaxFormType, value?: unknown) {
  return Object.assign(getEmptyTaxFormData(formType), value || {}) as EmployeeTaxFormData;
}
