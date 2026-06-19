import { z } from "zod";

import { isValidPatientReferralDocumentType, isValidPatientReferralSourceType } from "./options";

const optionalStr = z.string().trim().optional().nullable();
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

const optionalInt = z
  .union([z.number().int().min(0), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const m = String(v).match(/\d+/);
    return m ? Number(m[0]) : null;
  });

export const patientReferralReviewSchema = z
  .object({
    first_name: z.string().trim().min(1, "First name is required"),
    last_name: z.string().trim().min(1, "Last name is required"),
    full_name: optionalStr,
    date_of_birth: optionalDate,
    age: optionalInt,
    sex: optionalStr,
    phone: optionalStr,
    alternate_phone: optionalStr,
    address_line_1: optionalStr,
    address_line_2: optionalStr,
    city: optionalStr,
    state: optionalStr,
    zip: optionalStr,
    emergency_contact_1_name: optionalStr,
    emergency_contact_1_phone: optionalStr,
    emergency_contact_2_name: optionalStr,
    emergency_contact_2_phone: optionalStr,
    referral_source_type: z.string().refine(isValidPatientReferralSourceType, "Select a referral source"),
    referral_source_name: optionalStr,
    referral_facility: optionalStr,
    source_contact_name: optionalStr,
    source_phone: optionalStr,
    source_fax: optionalStr,
    source_email: optionalStr,
    sales_agent_name: optionalStr,
    referral_received_date: optionalDate,
    requested_soc_date: optionalDate,
    best_available_soc_date: optionalDate,
    discharge_date: optionalDate,
    chief_complaint: optionalStr,
    diagnosis_text: optionalStr,
    diagnosis_code: optionalStr,
    prior_medical_history: optionalStr,
    allergies: optionalStr,
    notes: optionalStr,
    ordering_physician_name: optionalStr,
    ordering_physician_phone: optionalStr,
    ordering_physician_fax: optionalStr,
    pcp_name: optionalStr,
    pcp_phone: optionalStr,
    pcp_fax: optionalStr,
    following_physician_name: optionalStr,
    following_physician_phone: optionalStr,
    following_physician_fax: optionalStr,
    insurance_name: optionalStr,
    payer_type: optionalStr,
    member_id: optionalStr,
    medicaid_id: optionalStr,
    mbi: optionalStr,
    authorization_number: optionalStr,
    authorization_type: optionalStr,
    authorization_bill_type: optionalStr,
    authorization_effective_start: optionalDate,
    authorization_effective_end: optionalDate,
    skilled_nursing_visits: optionalInt,
    pt_visits: optionalInt,
    ot_visits: optionalInt,
    st_visits: optionalInt,
    msw_visits: optionalInt,
    hha_visits: optionalInt,
    approved_disciplines: optionalStr,
    denied_disciplines: optionalStr,
    total_authorized_visits: optionalInt,
    authorization_status: optionalStr,
    agency_assigned: optionalStr,
    assigned_to_saintly: z.union([z.boolean(), z.string()]).optional().nullable(),
    intake_status: z.string().trim().min(1, "Intake status is required"),
    patient_status: optionalStr,
    document_type: z
      .string()
      .optional()
      .nullable()
      .refine((v) => !v || isValidPatientReferralDocumentType(v), "Invalid document type"),
  })
  .superRefine((data, ctx) => {
    const hasPhone = Boolean(data.phone?.trim());
    const hasAddress = Boolean(
      data.address_line_1?.trim() || data.city?.trim() || data.state?.trim() || data.zip?.trim()
    );
    if (!hasPhone && !hasAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone or address is required",
        path: ["phone"],
      });
    }
    if (data.referral_source_type === "sales_agent" && !data.sales_agent_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sales agent name is recommended when source is Sales Agent",
        path: ["sales_agent_name"],
      });
    }
  });

export type PatientReferralReviewInput = z.infer<typeof patientReferralReviewSchema>;

export const patientReferralDuplicateCheckSchema = z.object({
  first_name: optionalStr,
  last_name: optionalStr,
  full_name: optionalStr,
  date_of_birth: optionalDate,
  phone: optionalStr,
  mbi: optionalStr,
  member_id: optionalStr,
  authorization_number: optionalStr,
  address_line_1: optionalStr,
  city: optionalStr,
  state: optionalStr,
  zip: optionalStr,
});
