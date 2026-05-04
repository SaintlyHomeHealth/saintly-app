"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import OnboardingAdminPreviewClient from "../../components/OnboardingAdminPreviewClient";
import OnboardingApplicantFromQuery from "../../components/OnboardingApplicantFromQuery";
import OnboardingProgressSync from "../../components/OnboardingProgressSync";
import OnboardingApplicantIdentity from "../../components/OnboardingApplicantIdentity";
import { supabase } from "@/lib/supabase/client";
import { EmploymentClassification } from "@/lib/employee-contracts";
import {
  EmployeeTaxFormRow,
  EmployeeTaxFormType,
  getTaxFormLabel,
  getTaxFormTypeForClassification,
} from "@/lib/employee-tax-forms";
import EmployeeContractReviewCard from "./EmployeeContractReviewCard";
import EmployeeTaxFormCard from "./EmployeeTaxFormCard";
import { appCalendarMidnightUtc, formatAppDate } from "@/lib/datetime/app-timezone";

type RoleKey =
  | "registered_nurse"
  | "licensed_practical_nurse"
  | "physical_therapist"
  | "physical_therapy_assistant"
  | "occupational_therapist"
  | "occupational_therapy_assistant"
  | "speech_therapist"
  | "medical_social_worker"
  | "home_health_aide";

type RoleConfig = {
  key: RoleKey;
  label: string;
  badge: string;
  summary: string;
  description: string[];
};

const ROLE_OPTIONS: RoleConfig[] = [
  {
    key: "registered_nurse",
    label: "Registered Nurse (RN)",
    badge: "Clinical",
    summary:
      "Provides skilled nursing visits, assessments, care planning, coordination, and patient education.",
    description: [
      "Performs comprehensive nursing assessments and identifies patient needs in the home setting.",
      "Develops, updates, and implements the plan of care in coordination with the physician and interdisciplinary team.",
      "Provides skilled nursing interventions, medication education, wound care, disease management, and patient/caregiver teaching.",
      "Accurately completes OASIS, visit documentation, supervisory visits, and all required clinical records.",
      "Communicates changes in condition promptly and helps coordinate services to support safe care at home.",
    ],
  },
  {
    key: "licensed_practical_nurse",
    label: "Licensed Practical Nurse (LPN/LVN)",
    badge: "Clinical",
    summary:
      "Delivers nursing care under supervision, supports treatments, observes patient condition, and documents care.",
    description: [
      "Provides skilled nursing tasks and treatments as permitted under state law and agency policy.",
      "Observes, reports, and documents patient condition, response to care, and changes needing escalation.",
      "Assists with medication administration, wound care, treatments, and patient/caregiver instruction.",
      "Collaborates with supervising RN and interdisciplinary team members to support continuity of care.",
      "Maintains timely, accurate, and complete visit documentation in the agency EMR.",
    ],
  },
  {
    key: "physical_therapist",
    label: "Physical Therapist (PT)",
    badge: "Therapy",
    summary:
      "Evaluates mobility and function, develops therapy plans, and improves safety and independence at home.",
    description: [
      "Performs physical therapy evaluations and establishes a treatment plan based on physician orders and patient goals.",
      "Provides therapeutic exercise, gait training, balance training, transfer training, and fall prevention interventions.",
      "Evaluates functional mobility, strength, endurance, pain, and safety within the home environment.",
      "Educates patients and caregivers on exercises, equipment, mobility techniques, and safety strategies.",
      "Documents progress, reassessments, and discharge planning in accordance with agency and payer requirements.",
    ],
  },
  {
    key: "physical_therapy_assistant",
    label: "Physical Therapy Assistant (PTA)",
    badge: "Therapy",
    summary:
      "Carries out the PT plan of care, provides exercises and mobility training, and reports progress.",
    description: [
      "Implements the physical therapy treatment plan under the supervision of the Physical Therapist.",
      "Provides therapeutic exercises, transfer training, gait activities, and functional mobility support.",
      "Monitors patient response to interventions and communicates progress or concerns to the supervising PT.",
      "Reinforces home exercise programs and safety instructions with patients and caregivers.",
      "Completes timely documentation for each visit according to agency standards.",
    ],
  },
  {
    key: "occupational_therapist",
    label: "Occupational Therapist (OT)",
    badge: "Therapy",
    summary:
      "Evaluates ability to perform daily activities and develops treatment plans to improve independence.",
    description: [
      "Performs occupational therapy evaluations focused on activities of daily living, safety, cognition, and functional performance.",
      "Develops and implements treatment plans to improve independence in dressing, bathing, toileting, meal preparation, and related tasks.",
      "Assesses the home environment and recommends adaptive equipment, techniques, and modifications.",
      "Educates patients and caregivers on safe performance of daily tasks and compensatory strategies.",
      "Documents evaluation findings, interventions, progress, and discharge planning in compliance with agency requirements.",
    ],
  },
  {
    key: "occupational_therapy_assistant",
    label: "Occupational Therapy Assistant (COTA)",
    badge: "Therapy",
    summary:
      "Implements OT treatment plans and helps patients improve day-to-day function in the home.",
    description: [
      "Provides occupational therapy interventions under the direction of the Occupational Therapist.",
      "Assists patients with therapeutic activities to improve ADLs, fine motor skills, coordination, and home safety.",
      "Monitors patient performance and communicates findings and concerns to the supervising OT.",
      "Reinforces patient and caregiver education related to adaptive techniques and functional independence.",
      "Maintains accurate and timely documentation for all assigned visits.",
    ],
  },
  {
    key: "speech_therapist",
    label: "Speech Language Pathologist (SLP)",
    badge: "Therapy",
    summary:
      "Evaluates and treats speech, language, cognitive, and swallowing deficits in the home setting.",
    description: [
      "Evaluates communication, cognition, and swallowing disorders and develops an individualized treatment plan.",
      "Provides therapy to improve expressive and receptive language, speech clarity, cognitive communication, and dysphagia management.",
      "Educates patients and caregivers on exercises, compensatory strategies, dietary precautions, and safety techniques.",
      "Coordinates with physicians and the care team regarding progress, risks, and recommendations.",
      "Completes required documentation, progress updates, and discharge planning per agency standards.",
    ],
  },
  {
    key: "medical_social_worker",
    label: "Medical Social Worker (MSW)",
    badge: "Support",
    summary:
      "Assesses psychosocial needs, connects patients to resources, and supports safe care transitions.",
    description: [
      "Assesses psychosocial, emotional, family, environmental, and financial factors affecting patient care.",
      "Provides counseling, support, crisis intervention, and resource coordination as appropriate.",
      "Helps patients and families access community services, benefits, and care planning resources.",
      "Collaborates with the interdisciplinary team to address barriers to care and discharge planning needs.",
      "Documents findings, interventions, and recommendations clearly and timely.",
    ],
  },
  {
    key: "home_health_aide",
    label: "Home Health Aide (HHA/CNA)",
    badge: "Personal Care",
    summary:
      "Provides personal care and support services under supervision to help patients remain safe at home.",
    description: [
      "Assists patients with personal care activities such as bathing, grooming, dressing, toileting, and mobility.",
      "Observes and reports changes in patient condition, environment, or functioning to the supervising clinician.",
      "Supports infection prevention, comfort, and safe care routines in the home setting.",
      "Follows the aide care plan and agency policies at all times.",
      "Documents assigned care tasks and visit details accurately and promptly.",
    ],
  },
];

type ContractsRow = {
  applicant_id: string;
  selected_role: string;
  role_title: string;
  role_description: string;
  handbook_acknowledged: boolean;
  job_description_acknowledged: boolean;
  policies_acknowledged: boolean;
  electronic_signature: string;
  signed_at: string | null;
  completed: boolean;
  job_acceptance_acknowledged?: boolean | null;
  job_acceptance_full_name?: string | null;
  job_acceptance_signed_at?: string | null;
  i9_s1_last_name?: string | null;
  i9_s1_first_name?: string | null;
  i9_s1_middle_initial?: string | null;
  i9_s1_other_last_names?: string | null;
  i9_s1_street_address?: string | null;
  i9_s1_apt_number?: string | null;
  i9_s1_city?: string | null;
  i9_s1_state?: string | null;
  i9_s1_zip_code?: string | null;
  i9_s1_dob?: string | null;
  i9_s1_ssn?: string | null;
  i9_s1_email?: string | null;
  i9_s1_phone?: string | null;
  i9_s1_attest_status?: string | null;
  i9_s1_lpr_a_number?: string | null;
  i9_s1_alien_work_until?: string | null;
  i9_s1_alien_id_type?: string | null;
  i9_s1_alien_a_number?: string | null;
  i9_s1_i94_number?: string | null;
  i9_s1_foreign_passport_number?: string | null;
  i9_s1_passport_country?: string | null;
  i9_s1_prep_used?: boolean | null;
  i9_s1_prep_full_name?: string | null;
  i9_s1_prep_street?: string | null;
  i9_s1_prep_city?: string | null;
  i9_s1_prep_state?: string | null;
  i9_s1_prep_zip?: string | null;
  i9_s1_employee_ack?: boolean | null;
  i9_s1_employee_full_name?: string | null;
  i9_s1_signed_at?: string | null;
  conflict_confidentiality_acknowledged?: boolean | null;
  conflict_confidentiality_disclosure?: string | null;
  conflict_confidentiality_full_name?: string | null;
  conflict_confidentiality_signed_at?: string | null;
  electronic_signature_agreement_acknowledged?: boolean | null;
  electronic_signature_agreement_full_name?: string | null;
  electronic_signature_agreement_signed_at?: string | null;
  hep_b_declination_acknowledged?: boolean | null;
  hep_b_declination_full_name?: string | null;
  hep_b_declination_signed_at?: string | null;
  tb_history_positive_test_or_infection?: boolean | null;
  tb_history_bcg_vaccine?: boolean | null;
  tb_symptom_prolonged_recurrent_fever?: boolean | null;
  tb_symptom_recent_weight_loss?: boolean | null;
  tb_symptom_chronic_cough?: boolean | null;
  tb_symptom_coughing_blood?: boolean | null;
  tb_symptom_night_sweats?: boolean | null;
  tb_risk_silicosis?: boolean | null;
  tb_risk_gastrectomy?: boolean | null;
  tb_risk_intestinal_bypass?: boolean | null;
  tb_risk_weight_10_percent_below_ideal?: boolean | null;
  tb_risk_chronic_renal_disease?: boolean | null;
  tb_risk_diabetes_mellitus?: boolean | null;
  tb_risk_steroid_or_immunosuppressive_therapy?: boolean | null;
  tb_risk_hematologic_disorder?: boolean | null;
  tb_risk_exposure_to_hiv_or_aids?: boolean | null;
  tb_risk_other_malignancies?: boolean | null;
  tb_baseline_residence_high_tb_country?: boolean | null;
  tb_baseline_current_or_planned_immunosuppression?: boolean | null;
  tb_baseline_close_contact_with_infectious_tb?: boolean | null;
  tb_additional_comments?: string | null;
  tb_acknowledged?: boolean | null;
  tb_full_name?: string | null;
  tb_signed_at?: string | null;
};

type YesNoValue = "" | "yes" | "no";

type I9Section1FormData = {
  lastName: string;
  firstName: string;
  middleInitial: string;
  otherLastNames: string;
  streetAddress: string;
  aptNumber: string;
  city: string;
  state: string;
  zipCode: string;
  dateOfBirth: string;
  ssn: string;
  email: string;
  phone: string;
  attestStatus:
    | ""
    | "citizen"
    | "noncitizen_national"
    | "lawful_permanent_resident"
    | "alien_authorized";
  lprANumber: string;
  alienWorkUntil: string;
  alienIdType: "" | "a_number" | "i94" | "foreign_passport";
  alienANumber: string;
  i94Number: string;
  foreignPassportNumber: string;
  passportCountry: string;
  preparerUsed: YesNoValue;
  preparerFullName: string;
  preparerStreet: string;
  preparerCity: string;
  preparerState: string;
  preparerZip: string;
  employeeAck: boolean;
  employeeFullName: string;
  signedDate: string;
};

const INITIAL_FORM = {
  selectedRole: "",
  handbookAcknowledged: false,
  jobDescriptionAcknowledged: false,
  policiesAcknowledged: false,
  electronicSignature: "",
};

const DEFAULT_I9_SECTION_1_FORM: I9Section1FormData = {
  lastName: "",
  firstName: "",
  middleInitial: "",
  otherLastNames: "",
  streetAddress: "",
  aptNumber: "",
  city: "",
  state: "",
  zipCode: "",
  dateOfBirth: "",
  ssn: "",
  email: "",
  phone: "",
  attestStatus: "",
  lprANumber: "",
  alienWorkUntil: "",
  alienIdType: "",
  alienANumber: "",
  i94Number: "",
  foreignPassportNumber: "",
  passportCountry: "",
  preparerUsed: "",
  preparerFullName: "",
  preparerStreet: "",
  preparerCity: "",
  preparerState: "",
  preparerZip: "",
  employeeAck: false,
  employeeFullName: "",
  signedDate: "",
};

type I9Section1PdfData = {
  i9_s1_last_name?: string | null;
  i9_s1_first_name?: string | null;
  i9_s1_middle_initial?: string | null;
  i9_s1_street_address?: string | null;
  i9_s1_city?: string | null;
  i9_s1_state?: string | null;
  i9_s1_zip_code?: string | null;
  i9_s1_dob?: string | null;
  i9_s1_ssn?: string | null;
  i9_s1_email?: string | null;
  i9_s1_phone?: string | null;
  i9_s1_attest_status?: string | null;
  i9_s1_lpr_a_number?: string | null;
  i9_s1_alien_work_until?: string | null;
  i9_s1_alien_a_number?: string | null;
  i9_s1_i94_number?: string | null;
  i9_s1_foreign_passport_number?: string | null;
  i9_s1_passport_country?: string | null;
  i9_s1_employee_full_name?: string | null;
  i9_s1_signed_at?: string | null;
};

type TrainingModulePdfRow = {
  id: string;
  title: string | null;
  sort_order: number | null;
};

type TrainingCompletionPdfRow = {
  module_id: string;
  score: number;
  passed: boolean;
  completed_at: string;
  module_title?: string | null;
  module_sort_order?: number | null;
};

type HiringPacketPdfData = ContractsRow;

function formatPdfValue(value?: string | null): string {
  return value?.trim() ? value.trim() : "—";
}

function formatPdfBoolean(value?: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function formatPdfList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "None reported";
}

function getHiringPacketEmployeeName(data: HiringPacketPdfData): string {
  const i9Name = [
    data.i9_s1_first_name,
    data.i9_s1_middle_initial,
    data.i9_s1_last_name,
  ]
    .filter((value) => Boolean(value?.trim()))
    .join(" ")
    .trim();

  if (i9Name) return i9Name;
  if (data.job_acceptance_full_name?.trim()) return data.job_acceptance_full_name.trim();
  if (data.i9_s1_employee_full_name?.trim()) return data.i9_s1_employee_full_name.trim();
  if (data.electronic_signature?.trim()) return data.electronic_signature.trim();
  return "Employee Name Not Provided";
}

function getSafePdfFileName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "employee";
}

function formatPdfDate(value?: string | null): string {
  if (!value) return "—";
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const mid = appCalendarMidnightUtc(raw);
    if (!mid) return value;
    return formatAppDate(mid, raw, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return formatAppDate(raw, raw, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getI9AttestationLabel(data: I9Section1PdfData): string {
  switch (data.i9_s1_attest_status) {
    case "citizen":
      return "A citizen of the United States";
    case "noncitizen_national":
      return "A noncitizen national of the United States";
    case "lawful_permanent_resident":
      return `A lawful permanent resident (USCIS/A-Number: ${formatPdfValue(data.i9_s1_lpr_a_number)})`;
    case "alien_authorized": {
      const details = [
        `Authorized until: ${formatPdfValue(data.i9_s1_alien_work_until)}`,
        `A-Number: ${formatPdfValue(data.i9_s1_alien_a_number)}`,
        `I-94 Number: ${formatPdfValue(data.i9_s1_i94_number)}`,
        `Foreign Passport Number: ${formatPdfValue(data.i9_s1_foreign_passport_number)}`,
        `Passport Country: ${formatPdfValue(data.i9_s1_passport_country)}`,
      ];
      return `An alien authorized to work\n${details.join("\n")}`;
    }
    default:
      return "—";
  }
}

async function generateI9Section1Pdf(data: I9Section1PdfData) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = height - margin;

  const addPage = () => {
    page = pdfDoc.addPage([612, 792]);
    y = height - margin;
  };

  const ensureSpace = (needed = 24) => {
    if (y < margin + needed) addPage();
  };

  const drawWrappedText = (text: string, bold = false, size = 10) => {
    const activeFont = bold ? boldFont : font;
    const maxWidth = width - margin * 2;
    const paragraphs = text.split("\n");

    paragraphs.forEach((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";

      if (words.length === 0) {
        y -= size + 6;
        return;
      }

      words.forEach((word) => {
        const nextLine = line ? `${line} ${word}` : word;
        const nextWidth = activeFont.widthOfTextAtSize(nextLine, size);

        if (nextWidth > maxWidth && line) {
          ensureSpace(size + 10);
          page.drawText(line, {
            x: margin,
            y,
            size,
            font: activeFont,
            color: rgb(0.15, 0.15, 0.2),
          });
          y -= size + 6;
          line = word;
          return;
        }

        line = nextLine;
      });

      if (line) {
        ensureSpace(size + 10);
        page.drawText(line, {
          x: margin,
          y,
          size,
          font: activeFont,
          color: rgb(0.15, 0.15, 0.2),
        });
        y -= size + 6;
      }
    });
  };

  const drawSectionTitle = (title: string) => {
    y -= 4;
    drawWrappedText(title, true, 13);
    y -= 2;
  };

  const drawField = (label: string, value?: string | null) => {
    drawWrappedText(`${label}: ${formatPdfValue(value)}`);
  };

  drawWrappedText("Form I-9 — Section 1", true, 20);
  drawWrappedText("Generated from onboarding contracts data", false, 11);
  y -= 8;

  drawSectionTitle("Employee Information");
  drawField(
    "Employee Name",
    [data.i9_s1_first_name, data.i9_s1_middle_initial, data.i9_s1_last_name]
      .filter(Boolean)
      .join(" ")
  );
  drawField("Street Address", data.i9_s1_street_address);
  drawField("City", data.i9_s1_city);
  drawField("State", data.i9_s1_state);
  drawField("ZIP Code", data.i9_s1_zip_code);
  drawField("Date of Birth", formatPdfDate(data.i9_s1_dob));
  drawField("Social Security Number", data.i9_s1_ssn);
  drawField("Email Address", data.i9_s1_email);
  drawField("Telephone Number", data.i9_s1_phone);

  drawSectionTitle("Citizenship / Attestation");
  drawWrappedText(getI9AttestationLabel(data));
  drawWrappedText(
    "I attest, under penalty of perjury, that the information I have provided is true and correct and that I am authorized to work in the United States."
  );

  drawSectionTitle("Signature");
  drawField("Employee Full Legal Name", data.i9_s1_employee_full_name);
  drawField("Signed At", formatPdfDate(data.i9_s1_signed_at));

  return pdfDoc.save();
}

async function generateFullHiringPacketPdf(
  data: HiringPacketPdfData,
  trainingRows: TrainingCompletionPdfRow[] = []
) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = height - margin;

  const addPage = () => {
    page = pdfDoc.addPage([612, 792]);
    y = height - margin;
  };

  const ensureSpace = (needed = 24) => {
    if (y < margin + needed) addPage();
  };

  const drawWrappedText = (text: string, bold = false, size = 10) => {
    const activeFont = bold ? boldFont : font;
    const maxWidth = width - margin * 2;
    const paragraphs = text.split("\n");

    paragraphs.forEach((paragraph) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let line = "";

      if (words.length === 0) {
        y -= size + 6;
        return;
      }

      words.forEach((word) => {
        const nextLine = line ? `${line} ${word}` : word;
        const nextWidth = activeFont.widthOfTextAtSize(nextLine, size);

        if (nextWidth > maxWidth && line) {
          ensureSpace(size + 10);
          page.drawText(line, {
            x: margin,
            y,
            size,
            font: activeFont,
            color: rgb(0.15, 0.15, 0.2),
          });
          y -= size + 6;
          line = word;
          return;
        }

        line = nextLine;
      });

      if (line) {
        ensureSpace(size + 10);
        page.drawText(line, {
          x: margin,
          y,
          size,
          font: activeFont,
          color: rgb(0.15, 0.15, 0.2),
        });
        y -= size + 6;
      }
    });
  };

  const drawSectionTitle = (title: string) => {
    y -= 4;
    drawWrappedText(title, true, 13);
    y -= 2;
  };

  const drawSignatureLine = (label: string) => {
    ensureSpace(40);
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.55, 0.6, 0.68),
    });
    y -= 14;
    page.drawText(label, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.4, 0.45),
    });
    y -= 18;
  };

  const drawField = (label: string, value?: string | null) => {
    drawWrappedText(`${label}: ${formatPdfValue(value)}`);
  };

  const drawBooleanField = (label: string, value?: boolean | null) => {
    drawWrappedText(`${label}: ${formatPdfBoolean(value)}`);
  };

  const drawDivider = () => {
    ensureSpace(18);
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.84, 0.88, 0.93),
    });
    y -= 16;
  };

  const drawSectionHeader = (title: string) => {
    drawDivider();
    drawSectionTitle(title);
  };

  const tbRiskFactors = [
    data.tb_risk_silicosis ? "Silicosis" : "",
    data.tb_risk_gastrectomy ? "Gastrectomy" : "",
    data.tb_risk_intestinal_bypass ? "Intestinal bypass" : "",
    data.tb_risk_weight_10_percent_below_ideal
      ? "Weight 10 percent below ideal body weight"
      : "",
    data.tb_risk_chronic_renal_disease ? "Chronic renal disease" : "",
    data.tb_risk_diabetes_mellitus ? "Diabetes mellitus" : "",
    data.tb_risk_steroid_or_immunosuppressive_therapy
      ? "Prolonged high-dose corticosteroid therapy or other immunosuppressive therapy"
      : "",
    data.tb_risk_hematologic_disorder ? "Hematologic disorder" : "",
    data.tb_risk_exposure_to_hiv_or_aids ? "Exposure to HIV or AIDS" : "",
    data.tb_risk_other_malignancies ? "Other malignancies" : "",
  ].filter(Boolean);

  drawWrappedText("Saintly Home Health", true, 22);
  drawWrappedText("Employee Hiring Packet", true, 18);
  y -= 8;
  drawField("Employee Full Name", getHiringPacketEmployeeName(data));
  drawField("Applicant ID", data.applicant_id);
  drawField("Generated Date", formatPdfDate(new Date().toISOString()));
  y -= 10;

  drawSectionHeader("Job Acceptance Statement");
  drawWrappedText(
    "I have read, understand and agree to the terms specified in this job description for the position I presently hold. A copy of this job description has been given to me."
  );
  drawWrappedText(
    "I further understand that this job description may be reviewed at any time and that I will be provided with a revised copy."
  );
  drawBooleanField("Acknowledged", data.job_acceptance_acknowledged);
  drawField("Employee Full Legal Name", data.job_acceptance_full_name);
  drawField("Signed Date", formatPdfDate(data.job_acceptance_signed_at));

  drawSectionHeader("Form I-9 — Section 1");
  drawField("Employee Name", getHiringPacketEmployeeName(data));
  drawField("Street Address", data.i9_s1_street_address);
  drawField("City", data.i9_s1_city);
  drawField("State", data.i9_s1_state);
  drawField("ZIP Code", data.i9_s1_zip_code);
  drawField("Date of Birth", formatPdfDate(data.i9_s1_dob));
  drawField("Social Security Number", data.i9_s1_ssn);
  drawField("Email Address", data.i9_s1_email);
  drawField("Telephone Number", data.i9_s1_phone);
  drawWrappedText(`Citizenship / Attestation: ${getI9AttestationLabel(data)}`);
  drawWrappedText(
    "I attest, under penalty of perjury, that the information I have provided is true and correct and that I am authorized to work in the United States."
  );
  drawField("Employee Full Legal Name", data.i9_s1_employee_full_name);
  drawField("Signed Date", formatPdfDate(data.i9_s1_signed_at));

  drawSectionHeader("Conflict of Interest + Confidentiality");
  drawWrappedText(
    "I have read and am fully familiar with the Agency's policy statement regarding conflict of interest. I will disclose all known relationships that may present a conflict of interest and understand that patient privacy and Protected Health Information must be maintained at all times."
  );
  drawBooleanField("Acknowledged", data.conflict_confidentiality_acknowledged);
  drawField("Disclosure", data.conflict_confidentiality_disclosure);
  drawField("Employee Full Legal Name", data.conflict_confidentiality_full_name);
  drawField("Signed Date", formatPdfDate(data.conflict_confidentiality_signed_at));

  drawSectionHeader("Electronic Documentation Signature Agreement");
  drawWrappedText(
    "I understand that Agency staff may use electronic signatures on computer-generated documentation and that my login authentication password and signature passcode serve as my legal signature for the computerized medical record and other agency documentation."
  );
  drawBooleanField("Acknowledged", data.electronic_signature_agreement_acknowledged);
  drawField("Employee Full Legal Name", data.electronic_signature_agreement_full_name);
  drawField("Signed Date", formatPdfDate(data.electronic_signature_agreement_signed_at));

  drawSectionHeader("TB Questionnaire / Risk Assessment");
  drawWrappedText(
    "Please complete this tuberculosis questionnaire and risk assessment honestly and completely. This information is used to document TB history, current symptoms, and baseline risk factors in accordance with Saintly Home Health onboarding requirements."
  );
  drawBooleanField(
    "Positive TB skin test or history of TB infection",
    data.tb_history_positive_test_or_infection
  );
  drawBooleanField("BCG vaccine", data.tb_history_bcg_vaccine);
  drawBooleanField(
    "Prolonged or recurrent fever",
    data.tb_symptom_prolonged_recurrent_fever
  );
  drawBooleanField("Recent weight loss", data.tb_symptom_recent_weight_loss);
  drawBooleanField("Chronic cough", data.tb_symptom_chronic_cough);
  drawBooleanField("Coughing blood", data.tb_symptom_coughing_blood);
  drawBooleanField("Night sweats", data.tb_symptom_night_sweats);
  drawWrappedText(`Risk Factors: ${formatPdfList(tbRiskFactors)}`);
  drawBooleanField(
    "Residence greater than 1 month in a high TB rate country",
    data.tb_baseline_residence_high_tb_country
  );
  drawBooleanField(
    "Current or planned immunosuppression",
    data.tb_baseline_current_or_planned_immunosuppression
  );
  drawBooleanField(
    "Close contact with someone with infectious TB since last TB test",
    data.tb_baseline_close_contact_with_infectious_tb
  );
  drawField("Additional Comments", data.tb_additional_comments);
  drawBooleanField("Acknowledged", data.tb_acknowledged);
  drawField("Employee Full Legal Name", data.tb_full_name);
  drawField("Signed Date", formatPdfDate(data.tb_signed_at));

  drawSectionHeader("Hepatitis B Vaccine Declination");
  drawWrappedText(
    "I understand that due to my occupational exposure to blood or other potentially infectious materials, I may be at risk of acquiring Hepatitis B virus (HBV) infection. I have been given the opportunity to be vaccinated with Hepatitis B vaccine at no charge to myself. However, I decline Hepatitis B vaccination at this time."
  );
  drawWrappedText(
    "I understand that by declining this vaccine, I continue to be at risk of acquiring Hepatitis B, a serious disease, and I accept responsibility for this decision."
  );
  drawBooleanField("Acknowledged", data.hep_b_declination_acknowledged);
  drawField("Employee Full Legal Name", data.hep_b_declination_full_name);
  drawField("Signed Date", formatPdfDate(data.hep_b_declination_signed_at));

  drawSectionHeader("Orientation Training Completion");
  drawWrappedText("Saintly Home Health training completion", true, 16);
  drawField("Employee Full Name", getHiringPacketEmployeeName(data));
  drawField("Applicant ID", data.applicant_id);
  drawWrappedText(
    "This employee completed the required onboarding training modules assigned by Saintly Home Health."
  );
  y -= 4;

  if (trainingRows.length === 0) {
    drawWrappedText("No onboarding training completion records were found.");
  } else {
    trainingRows.forEach((row, index) => {
      drawWrappedText(`${index + 1}. ${formatPdfValue(row.module_title)}`, true, 11);
      drawField("Score", `${row.score}%`);
      drawField("Passed", row.passed ? "Passed" : "Not passed");
      drawField("Completed Date", formatPdfDate(row.completed_at));
      y -= 4;
    });
  }

  drawWrappedText(
    "Final completion statement: All required onboarding training results listed above are included in this hiring packet for audit and personnel record review."
  );
  y -= 8;
  drawSignatureLine("Employee Signature / Date");
  drawSignatureLine("Saintly Reviewer Signature / Date");

  return pdfDoc.save();
}

function toYesNo(value?: boolean | null): YesNoValue {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function fromYesNo(value: YesNoValue): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export default function OnboardingContractsPage() {
  const JOB_ACCEPTANCE_SECTION_ID = "job-acceptance-section";
  const I9_SECTION_ID = "i9-section";
  const CONTRACT_REVIEW_SECTION_ID = "employee-contract-review-section";
  const TAX_FORM_SECTION_ID = "employee-tax-form-section";
  const [applicantId, setApplicantId] = useState<string>("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [jobAcceptanceForm, setJobAcceptanceForm] = useState({
    acknowledged: false,
    fullName: "",
    signedDate: "",
  });
  const [contractRecord, setContractRecord] = useState<ContractsRow | null>(null);
  const [i9Section1Form, setI9Section1Form] =
    useState<I9Section1FormData>(DEFAULT_I9_SECTION_1_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingJobAcceptanceForm, setIsSavingJobAcceptanceForm] = useState(false);
  const [isSavingI9Section1Form, setIsSavingI9Section1Form] = useState(false);
  const [isDownloadingI9Pdf, setIsDownloadingI9Pdf] = useState(false);
  const [isDownloadingHiringPacketPdf, setIsDownloadingHiringPacketPdf] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [employmentClassification, setEmploymentClassification] =
    useState<EmploymentClassification | null>(null);
  const [pendingPortalItems, setPendingPortalItems] = useState<string[]>([]);
  const [currentContractStatus, setCurrentContractStatus] = useState<string | null>(null);
  const [currentTaxFormStatus, setCurrentTaxFormStatus] =
    useState<EmployeeTaxFormRow["form_status"] | null>(null);
  const [currentTaxFormType, setCurrentTaxFormType] = useState<EmployeeTaxFormType | null>(null);
  const [jobAcceptanceFormMessage, setJobAcceptanceFormMessage] = useState("");
  const [jobAcceptanceFormError, setJobAcceptanceFormError] = useState("");
  const [i9Section1FormMessage, setI9Section1FormMessage] = useState("");
  const [i9Section1FormError, setI9Section1FormError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      const storedApplicantId = window.localStorage.getItem("applicantId") || "";
      setApplicantId(storedApplicantId);
    });
  }, []);

  const selectedRoleConfig = useMemo(
    () => ROLE_OPTIONS.find((role) => role.key === form.selectedRole),
    [form.selectedRole]
  );

  const isComplete =
    !!form.selectedRole &&
    form.handbookAcknowledged &&
    form.jobDescriptionAcknowledged &&
    form.policiesAcknowledged &&
    form.electronicSignature.trim().length >= 2;
  const isJobAcceptanceFormComplete =
    jobAcceptanceForm.acknowledged &&
    jobAcceptanceForm.fullName.trim().length > 0 &&
    Boolean(jobAcceptanceForm.signedDate);
  const isI9Section1FormComplete =
    i9Section1Form.lastName.trim().length > 0 &&
    i9Section1Form.firstName.trim().length > 0 &&
    i9Section1Form.streetAddress.trim().length > 0 &&
    i9Section1Form.city.trim().length > 0 &&
    i9Section1Form.state.trim().length > 0 &&
    i9Section1Form.zipCode.trim().length > 0 &&
    Boolean(i9Section1Form.dateOfBirth) &&
    i9Section1Form.ssn.trim().length > 0 &&
    Boolean(i9Section1Form.attestStatus) &&
    (i9Section1Form.attestStatus !== "lawful_permanent_resident" ||
      i9Section1Form.lprANumber.trim().length > 0) &&
    (i9Section1Form.attestStatus !== "alien_authorized" ||
      (Boolean(i9Section1Form.alienWorkUntil) &&
        Boolean(i9Section1Form.alienIdType) &&
        ((i9Section1Form.alienIdType === "a_number" &&
          i9Section1Form.alienANumber.trim().length > 0) ||
          (i9Section1Form.alienIdType === "i94" &&
            i9Section1Form.i94Number.trim().length > 0) ||
          (i9Section1Form.alienIdType === "foreign_passport" &&
            i9Section1Form.foreignPassportNumber.trim().length > 0 &&
            i9Section1Form.passportCountry.trim().length > 0)))) &&
    Boolean(i9Section1Form.preparerUsed) &&
    (i9Section1Form.preparerUsed !== "yes" ||
      (i9Section1Form.preparerFullName.trim().length > 0 &&
        i9Section1Form.preparerStreet.trim().length > 0 &&
        i9Section1Form.preparerCity.trim().length > 0 &&
        i9Section1Form.preparerState.trim().length > 0 &&
        i9Section1Form.preparerZip.trim().length > 0)) &&
    i9Section1Form.employeeAck &&
    i9Section1Form.employeeFullName.trim().length > 0 &&
    Boolean(i9Section1Form.signedDate);
  const requiredCompletionItems = useMemo(() => {
    const items: Array<{ label: string; complete: boolean; targetId?: string; group: "setup" | "ack" | "form" }> = [
      { label: "Handbook acknowledged", complete: form.handbookAcknowledged, group: "ack" },
      { label: "Job description acknowledged", complete: form.jobDescriptionAcknowledged, group: "ack" },
      { label: "Policies acknowledged", complete: form.policiesAcknowledged, group: "ack" },
      {
        label: "Electronic signature added",
        complete: form.electronicSignature.trim().length >= 2,
        group: "setup",
      },
      {
        label: "Job acceptance completed",
        complete: isJobAcceptanceFormComplete,
        targetId: JOB_ACCEPTANCE_SECTION_ID,
        group: "form",
      },
      {
        label: "I-9 Section 1 completed",
        complete: isI9Section1FormComplete,
        targetId: I9_SECTION_ID,
        group: "form",
      },
    ];

    if (currentContractStatus === "sent") {
      items.push({
        label:
          employmentClassification === "contractor"
            ? "Independent Contractor Agreement"
            : "Employment Agreement",
        complete: false,
        targetId: CONTRACT_REVIEW_SECTION_ID,
        group: "form",
      });
    }

    if (currentTaxFormType && currentTaxFormStatus && currentTaxFormStatus !== "completed") {
      items.push({
        label: getTaxFormLabel(currentTaxFormType),
        complete: false,
        targetId: TAX_FORM_SECTION_ID,
        group: "form",
      });
    }

    return items;
  }, [
    currentContractStatus,
    currentTaxFormStatus,
    currentTaxFormType,
    employmentClassification,
    form.electronicSignature,
    form.handbookAcknowledged,
    form.jobDescriptionAcknowledged,
    form.policiesAcknowledged,
    isI9Section1FormComplete,
    isJobAcceptanceFormComplete,
  ]);
  const completedSetupCount = requiredCompletionItems.filter(
    (item) => item.group === "setup" && item.complete
  ).length;
  const completedAcknowledgementsCount = requiredCompletionItems.filter(
    (item) => item.group === "ack" && item.complete
  ).length;
  const completedContractFormsCount = requiredCompletionItems.filter(
    (item) => item.group === "form" && item.complete
  ).length;
  const totalSetupCount = requiredCompletionItems.filter((item) => item.group === "setup").length;
  const totalAcknowledgementsCount = requiredCompletionItems.filter(
    (item) => item.group === "ack"
  ).length;
  const totalContractFormsCount = requiredCompletionItems.filter(
    (item) => item.group === "form"
  ).length;
  const totalRequiredCount = requiredCompletionItems.length;
  const totalCompletedCount = requiredCompletionItems.filter((item) => item.complete).length;
  const percentComplete =
    totalRequiredCount === 0 ? 0 : Math.round((totalCompletedCount / totalRequiredCount) * 100);
  const isContractsProgressComplete = totalCompletedCount === totalRequiredCount;
  const canContinueToTraining = isContractsProgressComplete && isComplete;

  const scrollToSection = (targetId: string) => {
    const element = document.getElementById(targetId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!applicantId) {
      queueMicrotask(() => {
        setIsLoading(false);
      });
      return;
    }

    const loadExistingContract = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("onboarding_contracts")
        .select("*")
        .eq("applicant_id", applicantId)
        .maybeSingle<ContractsRow>();

      if (error) {
        setErrorMessage("We couldn’t load your contract details right now.");
        setIsLoading(false);
        return;
      }

      if (data) {
        setContractRecord(data);
        setForm({
          selectedRole: data.selected_role || "",
          handbookAcknowledged: data.handbook_acknowledged || false,
          jobDescriptionAcknowledged: data.job_description_acknowledged || false,
          policiesAcknowledged: data.policies_acknowledged || false,
          electronicSignature: data.electronic_signature || "",
        });
        setJobAcceptanceForm({
          acknowledged: Boolean(data.job_acceptance_acknowledged),
          fullName: data.job_acceptance_full_name || "",
          signedDate: data.job_acceptance_signed_at
            ? data.job_acceptance_signed_at.slice(0, 10)
            : "",
        });
        setI9Section1Form({
          lastName: data.i9_s1_last_name || "",
          firstName: data.i9_s1_first_name || "",
          middleInitial: data.i9_s1_middle_initial || "",
          otherLastNames: data.i9_s1_other_last_names || "",
          streetAddress: data.i9_s1_street_address || "",
          aptNumber: data.i9_s1_apt_number || "",
          city: data.i9_s1_city || "",
          state: data.i9_s1_state || "",
          zipCode: data.i9_s1_zip_code || "",
          dateOfBirth: data.i9_s1_dob || "",
          ssn: data.i9_s1_ssn || "",
          email: data.i9_s1_email || "",
          phone: data.i9_s1_phone || "",
          attestStatus:
            (data.i9_s1_attest_status as I9Section1FormData["attestStatus"]) || "",
          lprANumber: data.i9_s1_lpr_a_number || "",
          alienWorkUntil: data.i9_s1_alien_work_until || "",
          alienIdType:
            (data.i9_s1_alien_id_type as I9Section1FormData["alienIdType"]) || "",
          alienANumber: data.i9_s1_alien_a_number || "",
          i94Number: data.i9_s1_i94_number || "",
          foreignPassportNumber: data.i9_s1_foreign_passport_number || "",
          passportCountry: data.i9_s1_passport_country || "",
          preparerUsed: toYesNo(data.i9_s1_prep_used),
          preparerFullName: data.i9_s1_prep_full_name || "",
          preparerStreet: data.i9_s1_prep_street || "",
          preparerCity: data.i9_s1_prep_city || "",
          preparerState: data.i9_s1_prep_state || "",
          preparerZip: data.i9_s1_prep_zip || "",
          employeeAck: Boolean(data.i9_s1_employee_ack),
          employeeFullName: data.i9_s1_employee_full_name || "",
          signedDate: data.i9_s1_signed_at ? data.i9_s1_signed_at.slice(0, 10) : "",
        });
      }

      const { data: currentContractData } = await supabase
        .from("employee_contracts")
        .select("employment_classification, contract_status")
        .eq("applicant_id", applicantId)
        .eq("is_current", true)
        .maybeSingle<{
          employment_classification: EmploymentClassification;
          contract_status: string | null;
        }>();

      const nextClassification = currentContractData?.employment_classification || null;
      setEmploymentClassification(nextClassification);
      setCurrentContractStatus(currentContractData?.contract_status || null);

      const requiredTaxFormType = getTaxFormTypeForClassification(nextClassification);
      const nextPendingPortalItems: string[] = [];

      if (currentContractData?.contract_status === "sent") {
        nextPendingPortalItems.push(
          nextClassification === "contractor"
            ? "Independent Contractor Agreement"
            : "Employment Agreement"
        );
      }

      if (requiredTaxFormType) {
        const { data: currentTaxFormData } = await supabase
          .from("employee_tax_forms")
          .select("form_type, form_status")
          .eq("applicant_id", applicantId)
          .eq("is_current", true)
          .eq("form_type", requiredTaxFormType)
          .maybeSingle<Pick<EmployeeTaxFormRow, "form_type" | "form_status">>();

        setCurrentTaxFormStatus(currentTaxFormData?.form_status || null);
        setCurrentTaxFormType((currentTaxFormData?.form_type as EmployeeTaxFormType) || requiredTaxFormType);

        if (currentTaxFormData?.form_status === "sent") {
          nextPendingPortalItems.push(
            getTaxFormLabel(currentTaxFormData.form_type || requiredTaxFormType)
          );
        }
      } else {
        setCurrentTaxFormStatus(null);
        setCurrentTaxFormType(null);
      }

      setPendingPortalItems(nextPendingPortalItems);

      setIsLoading(false);
    };

    loadExistingContract();
  }, [applicantId]);

  const handleRoleChange = (role: string) => {
    setForm((prev) => ({
      ...prev,
      selectedRole: role,
    }));
    setSaveMessage("");
    setErrorMessage("");
  };

  const handleCheckboxChange = (
    field:
      | "handbookAcknowledged"
      | "jobDescriptionAcknowledged"
      | "policiesAcknowledged"
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
    setSaveMessage("");
    setErrorMessage("");
  };

  const handleSignatureChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      electronicSignature: value,
    }));
    setSaveMessage("");
    setErrorMessage("");
  };

  const handleSave = async () => {
    setSaveMessage("");
    setErrorMessage("");

    if (!applicantId) {
      setErrorMessage("Missing applicant ID. Please restart onboarding from Step 1.");
      return;
    }

    if (!selectedRoleConfig) {
      setErrorMessage("Please select your position before continuing.");
      return;
    }

    if (!isComplete) {
      setErrorMessage("Please complete all acknowledgments and sign before continuing.");
      return;
    }

    if (!canContinueToTraining) {
      const requiredTaxFormType = getTaxFormTypeForClassification(employmentClassification);
      setErrorMessage(
        requiredTaxFormType
          ? `Please complete your current ${getTaxFormLabel(requiredTaxFormType)} before continuing.`
          : "Please complete all required forms before continuing."
      );
      return;
    }

    setIsSaving(true);

    const payload: ContractsRow = {
      applicant_id: applicantId,
      selected_role: selectedRoleConfig.key,
      role_title: selectedRoleConfig.label,
      role_description: JSON.stringify(selectedRoleConfig.description),
      handbook_acknowledged: form.handbookAcknowledged,
      job_description_acknowledged: form.jobDescriptionAcknowledged,
      policies_acknowledged: form.policiesAcknowledged,
      electronic_signature: form.electronicSignature.trim(),
      signed_at: new Date().toISOString(),
      completed: true,
    };

    const { error } = await supabase
      .from("onboarding_contracts")
      .upsert(payload, { onConflict: "applicant_id" });

    if (error) {
      setErrorMessage("We couldn’t save your contracts right now. Please try again.");
      setIsSaving(false);
      return;
    }

    window.localStorage.setItem("onboardingStep4Complete", "true");
    setSaveMessage("Contracts saved successfully.");

    setIsSaving(false);

    window.location.href = "/onboarding-training";
  };

  const handleJobAcceptanceFormSave = async () => {
    if (!applicantId) return;

    setJobAcceptanceFormMessage("");
    setJobAcceptanceFormError("");

    if (
      !jobAcceptanceForm.acknowledged ||
      !jobAcceptanceForm.fullName.trim() ||
      !jobAcceptanceForm.signedDate
    ) {
      setJobAcceptanceFormError(
        "Please complete the acknowledgment, full legal name, and date before saving."
      );
      return;
    }

    setIsSavingJobAcceptanceForm(true);

    const signedAt = new Date(`${jobAcceptanceForm.signedDate}T12:00:00Z`).toISOString();
    const payload = {
      applicant_id: applicantId,
      job_acceptance_acknowledged: true,
      job_acceptance_full_name: jobAcceptanceForm.fullName.trim(),
      job_acceptance_signed_at: signedAt,
    };

    const { data, error } = await supabase
      .from("onboarding_contracts")
      .upsert(payload, { onConflict: "applicant_id" })
      .select();

    console.log("Job acceptance upsert result:", { data, error });

    if (error) {
      console.error("Error saving job acceptance form:", error);
      setJobAcceptanceFormError("We could not save this form right now. Please try again.");
      setIsSavingJobAcceptanceForm(false);
      return;
    }

    setJobAcceptanceFormMessage("Job Acceptance Statement saved.");
    setContractRecord((prev) => ({
      ...(prev || ({} as ContractsRow)),
      ...payload,
    }));
    setIsSavingJobAcceptanceForm(false);
  };

  const handleI9Section1FormSave = async () => {
    if (!applicantId) return;

    setI9Section1FormMessage("");
    setI9Section1FormError("");

    if (!isI9Section1FormComplete) {
      setI9Section1FormError("Please complete all required I-9 Section 1 fields before saving.");
      return;
    }

    setIsSavingI9Section1Form(true);

    const signedAt = new Date(`${i9Section1Form.signedDate}T12:00:00Z`).toISOString();
    const payload = {
      applicant_id: applicantId,
      i9_s1_last_name: i9Section1Form.lastName.trim(),
      i9_s1_first_name: i9Section1Form.firstName.trim(),
      i9_s1_middle_initial: i9Section1Form.middleInitial.trim() || null,
      i9_s1_other_last_names: i9Section1Form.otherLastNames.trim() || null,
      i9_s1_street_address: i9Section1Form.streetAddress.trim(),
      i9_s1_apt_number: i9Section1Form.aptNumber.trim() || null,
      i9_s1_city: i9Section1Form.city.trim(),
      i9_s1_state: i9Section1Form.state.trim(),
      i9_s1_zip_code: i9Section1Form.zipCode.trim(),
      i9_s1_dob: i9Section1Form.dateOfBirth,
      i9_s1_ssn: i9Section1Form.ssn.trim(),
      i9_s1_email: i9Section1Form.email.trim() || null,
      i9_s1_phone: i9Section1Form.phone.trim() || null,
      i9_s1_attest_status: i9Section1Form.attestStatus,
      i9_s1_lpr_a_number:
        i9Section1Form.attestStatus === "lawful_permanent_resident"
          ? i9Section1Form.lprANumber.trim()
          : null,
      i9_s1_alien_work_until:
        i9Section1Form.attestStatus === "alien_authorized"
          ? i9Section1Form.alienWorkUntil
          : null,
      i9_s1_alien_id_type:
        i9Section1Form.attestStatus === "alien_authorized"
          ? i9Section1Form.alienIdType
          : null,
      i9_s1_alien_a_number:
        i9Section1Form.attestStatus === "alien_authorized" &&
        i9Section1Form.alienIdType === "a_number"
          ? i9Section1Form.alienANumber.trim()
          : null,
      i9_s1_i94_number:
        i9Section1Form.attestStatus === "alien_authorized" &&
        i9Section1Form.alienIdType === "i94"
          ? i9Section1Form.i94Number.trim()
          : null,
      i9_s1_foreign_passport_number:
        i9Section1Form.attestStatus === "alien_authorized" &&
        i9Section1Form.alienIdType === "foreign_passport"
          ? i9Section1Form.foreignPassportNumber.trim()
          : null,
      i9_s1_passport_country:
        i9Section1Form.attestStatus === "alien_authorized" &&
        i9Section1Form.alienIdType === "foreign_passport"
          ? i9Section1Form.passportCountry.trim()
          : null,
      i9_s1_prep_used: fromYesNo(i9Section1Form.preparerUsed),
      i9_s1_prep_full_name:
        i9Section1Form.preparerUsed === "yes"
          ? i9Section1Form.preparerFullName.trim()
          : null,
      i9_s1_prep_street:
        i9Section1Form.preparerUsed === "yes"
          ? i9Section1Form.preparerStreet.trim()
          : null,
      i9_s1_prep_city:
        i9Section1Form.preparerUsed === "yes"
          ? i9Section1Form.preparerCity.trim()
          : null,
      i9_s1_prep_state:
        i9Section1Form.preparerUsed === "yes"
          ? i9Section1Form.preparerState.trim()
          : null,
      i9_s1_prep_zip:
        i9Section1Form.preparerUsed === "yes"
          ? i9Section1Form.preparerZip.trim()
          : null,
      i9_s1_employee_ack: true,
      i9_s1_employee_full_name: i9Section1Form.employeeFullName.trim(),
      i9_s1_signed_at: signedAt,
    };

    const { data, error } = await supabase
      .from("onboarding_contracts")
      .upsert(payload, { onConflict: "applicant_id" })
      .select();

    console.log("I-9 Section 1 upsert result:", { data, error });

    if (error) {
      console.error("Error saving I-9 Section 1 form:", error);
      setI9Section1FormError("We could not save this form right now. Please try again.");
      setIsSavingI9Section1Form(false);
      return;
    }

    setI9Section1FormMessage("Form I-9 — Section 1 saved.");
    setContractRecord((prev) => ({
      ...(prev || ({} as ContractsRow)),
      ...payload,
    }));
    setIsSavingI9Section1Form(false);
  };

  const handleDownloadI9Section1Pdf = async () => {
    setI9Section1FormMessage("");
    setI9Section1FormError("");
    setIsDownloadingI9Pdf(true);

    try {
      const pdfBytes = await generateI9Section1Pdf({
        i9_s1_last_name: i9Section1Form.lastName,
        i9_s1_first_name: i9Section1Form.firstName,
        i9_s1_middle_initial: i9Section1Form.middleInitial,
        i9_s1_street_address: i9Section1Form.streetAddress,
        i9_s1_city: i9Section1Form.city,
        i9_s1_state: i9Section1Form.state,
        i9_s1_zip_code: i9Section1Form.zipCode,
        i9_s1_dob: i9Section1Form.dateOfBirth,
        i9_s1_ssn: i9Section1Form.ssn,
        i9_s1_email: i9Section1Form.email,
        i9_s1_phone: i9Section1Form.phone,
        i9_s1_attest_status: i9Section1Form.attestStatus,
        i9_s1_lpr_a_number: i9Section1Form.lprANumber,
        i9_s1_alien_work_until: i9Section1Form.alienWorkUntil,
        i9_s1_alien_a_number: i9Section1Form.alienANumber,
        i9_s1_i94_number: i9Section1Form.i94Number,
        i9_s1_foreign_passport_number: i9Section1Form.foreignPassportNumber,
        i9_s1_passport_country: i9Section1Form.passportCountry,
        i9_s1_employee_full_name: i9Section1Form.employeeFullName,
        i9_s1_signed_at: i9Section1Form.signedDate || null,
      });

      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName =
        `${i9Section1Form.firstName}-${i9Section1Form.lastName}`.replace(/\s+/g, "-").toLowerCase() ||
        "employee";

      link.href = url;
      link.download = `i9-section-1-${safeName}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setI9Section1FormError("We could not generate the I-9 PDF right now. Please try again.");
    } finally {
      setIsDownloadingI9Pdf(false);
    }
  };

  const handleDownloadFullHiringPacketPdf = async () => {
    setErrorMessage("");
    setIsDownloadingHiringPacketPdf(true);

    try {
      const packetData: ContractsRow = {
        ...(contractRecord || ({} as ContractsRow)),
        applicant_id: applicantId,
        job_acceptance_acknowledged:
          jobAcceptanceForm.acknowledged || contractRecord?.job_acceptance_acknowledged || false,
        job_acceptance_full_name:
          jobAcceptanceForm.fullName.trim() || contractRecord?.job_acceptance_full_name || null,
        job_acceptance_signed_at:
          jobAcceptanceForm.signedDate || contractRecord?.job_acceptance_signed_at || null,
        i9_s1_last_name: i9Section1Form.lastName.trim() || contractRecord?.i9_s1_last_name || null,
        i9_s1_first_name:
          i9Section1Form.firstName.trim() || contractRecord?.i9_s1_first_name || null,
        i9_s1_middle_initial:
          i9Section1Form.middleInitial.trim() || contractRecord?.i9_s1_middle_initial || null,
        i9_s1_street_address:
          i9Section1Form.streetAddress.trim() || contractRecord?.i9_s1_street_address || null,
        i9_s1_city: i9Section1Form.city.trim() || contractRecord?.i9_s1_city || null,
        i9_s1_state: i9Section1Form.state.trim() || contractRecord?.i9_s1_state || null,
        i9_s1_zip_code: i9Section1Form.zipCode.trim() || contractRecord?.i9_s1_zip_code || null,
        i9_s1_dob: i9Section1Form.dateOfBirth || contractRecord?.i9_s1_dob || null,
        i9_s1_ssn: i9Section1Form.ssn.trim() || contractRecord?.i9_s1_ssn || null,
        i9_s1_email: i9Section1Form.email.trim() || contractRecord?.i9_s1_email || null,
        i9_s1_phone: i9Section1Form.phone.trim() || contractRecord?.i9_s1_phone || null,
        i9_s1_attest_status:
          i9Section1Form.attestStatus || contractRecord?.i9_s1_attest_status || null,
        i9_s1_lpr_a_number:
          i9Section1Form.lprANumber.trim() || contractRecord?.i9_s1_lpr_a_number || null,
        i9_s1_alien_work_until:
          i9Section1Form.alienWorkUntil || contractRecord?.i9_s1_alien_work_until || null,
        i9_s1_alien_a_number:
          i9Section1Form.alienANumber.trim() || contractRecord?.i9_s1_alien_a_number || null,
        i9_s1_i94_number:
          i9Section1Form.i94Number.trim() || contractRecord?.i9_s1_i94_number || null,
        i9_s1_foreign_passport_number:
          i9Section1Form.foreignPassportNumber.trim() ||
          contractRecord?.i9_s1_foreign_passport_number ||
          null,
        i9_s1_passport_country:
          i9Section1Form.passportCountry.trim() || contractRecord?.i9_s1_passport_country || null,
        i9_s1_employee_full_name:
          i9Section1Form.employeeFullName.trim() ||
          contractRecord?.i9_s1_employee_full_name ||
          null,
        i9_s1_signed_at: i9Section1Form.signedDate || contractRecord?.i9_s1_signed_at || null,
      };

      const [
        { data: trainingCompletionData, error: trainingCompletionError },
        { data: moduleData, error: moduleError },
      ] = await Promise.all([
        supabase
          .from("employee_training_completions")
          .select("module_id, score, passed, completed_at")
          .eq("applicant_id", applicantId)
          .order("completed_at", { ascending: true }),
        supabase
          .from("training_modules")
          .select("id, title, sort_order"),
      ]);

      if (trainingCompletionError) {
        throw trainingCompletionError;
      }

      if (moduleError) {
        throw moduleError;
      }

      const modulesById = ((moduleData || []) as TrainingModulePdfRow[]).reduce<
        Record<string, TrainingModulePdfRow>
      >((accumulator, module) => {
        accumulator[module.id] = module;
        return accumulator;
      }, {});

      const trainingRows = ((trainingCompletionData || []) as TrainingCompletionPdfRow[])
        .map((row) => ({
          ...row,
          module_title: modulesById[row.module_id]?.title || null,
          module_sort_order: modulesById[row.module_id]?.sort_order ?? null,
        }))
        .sort((a, b) => (a.module_sort_order ?? 999) - (b.module_sort_order ?? 999));

      const pdfBytes = await generateFullHiringPacketPdf(packetData, trainingRows);
      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = getSafePdfFileName(getHiringPacketEmployeeName(packetData));

      link.href = url;
      link.download = `employee-hiring-packet-${safeName}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setErrorMessage("We could not generate the full hiring packet PDF right now. Please try again.");
    } finally {
      setIsDownloadingHiringPacketPdf(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
        <Suspense fallback={null}>
          <OnboardingAdminPreviewClient />
        </Suspense>
        <div className="mx-auto max-w-6xl">
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="h-10 w-72 rounded bg-slate-200" />
              <div className="h-28 rounded-2xl bg-slate-100" />
              <div className="h-64 rounded-2xl bg-slate-100" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <Suspense fallback={null}>
        <OnboardingAdminPreviewClient />
      </Suspense>
      <Suspense fallback={null}>
        <OnboardingApplicantFromQuery />
      </Suspense>
      <OnboardingProgressSync />
      <div className="mx-auto max-w-6xl">
        <section className="px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
            <div className="rounded-full border border-teal-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 shadow-sm">
              Employee Onboarding · Step 4 of 6
            </div>
          </div>

          <OnboardingApplicantIdentity />

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { label: "1. Welcome", href: "/onboarding-welcome", state: "complete" },
              { label: "2. Application", href: "/onboarding-application", state: "complete" },
              { label: "3. Documents", href: "/onboarding-documents", state: "complete" },
              { label: "4. Contracts", href: "/onboarding-contracts", state: "current" },
              { label: "5. Training", href: "/onboarding-training", state: "upcoming" },
              { label: "6. Complete", href: "/onboarding-complete", state: "upcoming" },
            ].map((step) => {
              const isComplete = step.state === "complete";
              const isCurrent = step.state === "current";

              return (
                <a
                  key={step.label}
                  href={step.href}
                  className={[
                    "flex items-center justify-center rounded-full border px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.1em] transition",
                    isComplete
                      ? "border-teal-600 bg-teal-700 text-white shadow-lg shadow-teal-900/15"
                      : isCurrent
                        ? "border-teal-700 bg-gradient-to-br from-cyan-50 to-white text-slate-900 shadow-lg"
                        : "border-slate-200 bg-white text-slate-400 shadow-sm",
                  ].join(" ")}
                >
                  {isComplete ? `✓ ${step.label}` : step.label}
                </a>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-[28px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(224,247,244,1)_0%,_rgba(255,255,255,1)_58%)] p-6 shadow-[0_24px_60px_rgba(14,116,144,0.12)] sm:p-8">
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-teal-700">
                Welcome to Saintly Home Health
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Contracts, Policies & Role Acknowledgments
              </h1>

              <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                Review your role, acknowledge Saintly Home Health policies, and complete your
                electronic signature before continuing to training.
              </p>

              <div className="mx-auto mt-6 h-1.5 w-20 rounded-full bg-teal-700" />

              <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-slate-500">
                This step confirms your job description, agency acknowledgments, and signed
                onboarding agreement before training completion.
              </p>
            </div>
          </div>

          {pendingPortalItems.length > 0 ? (
            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-700">
                Action Required
              </div>
              <h2 className="mt-2 text-xl font-bold text-amber-900">
                Additional items need your attention on this page
              </h2>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                Saintly Home Health has sent additional agreement and/or tax form items that still
                require your signature or completion.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {pendingPortalItems.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      scrollToSection(
                        item === "Employment Agreement" || item === "Independent Contractor Agreement"
                          ? CONTRACT_REVIEW_SECTION_ID
                          : TAX_FORM_SECTION_ID
                      )
                    }
                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_2fr]">
            <aside className="space-y-6">
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Contract Progress
                </div>

                <div className="mt-3 text-3xl font-extrabold text-slate-900">
                  {totalCompletedCount}/{totalRequiredCount}
                </div>

                <p className="mt-2 text-sm text-slate-600">
                  Required contract items completed
                </p>

                <div className="mt-5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-teal-700 transition-all duration-300"
                    style={{ width: `${percentComplete}%` }}
                  />
                </div>

                <div className="mt-2 text-sm font-semibold text-teal-700">
                  {percentComplete}% complete
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Setup</span>
                    <span>
                      {completedSetupCount}/{totalSetupCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Acknowledgements</span>
                    <span>
                      {completedAcknowledgementsCount}/{totalAcknowledgementsCount}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 text-sm text-slate-600">
                    <span>Forms</span>
                    <span>
                      {completedContractFormsCount}/{totalContractFormsCount}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 text-sm font-semibold text-slate-900">
                    <span>Total</span>
                    <span>
                      {totalCompletedCount}/{totalRequiredCount}
                    </span>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-sm font-bold text-amber-900">
                    Before you continue
                  </div>
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    Complete each required acknowledgment and contract form before the next step.
                  </p>
                </div>

                {(errorMessage || saveMessage) && (
                  <div
                    className={`mt-6 rounded-2xl border p-4 text-sm ${
                      errorMessage
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {errorMessage || saveMessage}
                  </div>
                )}

                {applicantId ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Session
                    </div>
                    <div className="mt-2 break-all text-sm text-slate-600">
                      {applicantId}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Completion Status
                </p>
                <h3 className="mt-1 text-xl font-bold text-slate-900">Step 4 readiness</h3>

                <div className="mt-5 space-y-3">
                  <StatusRow
                    label="Handbook acknowledged"
                    complete={form.handbookAcknowledged}
                  />
                  <StatusRow
                    label="Job description acknowledged"
                    complete={form.jobDescriptionAcknowledged}
                  />
                  <StatusRow
                    label="Policies acknowledged"
                    complete={form.policiesAcknowledged}
                  />
                  <StatusRow
                    label="Electronic signature added"
                    complete={form.electronicSignature.trim().length >= 2}
                  />
                  <StatusRow
                    label="Job acceptance completed"
                    complete={isJobAcceptanceFormComplete}
                    targetId={JOB_ACCEPTANCE_SECTION_ID}
                    onClickTarget={scrollToSection}
                  />
                  <StatusRow
                    label="I-9 Section 1 completed"
                    complete={isI9Section1FormComplete}
                    targetId={I9_SECTION_ID}
                    onClickTarget={scrollToSection}
                  />
                  {currentContractStatus === "sent" ? (
                    <StatusRow
                      label={
                        employmentClassification === "contractor"
                          ? "Independent Contractor Agreement"
                          : "Employment Agreement"
                      }
                      complete={false}
                      targetId={CONTRACT_REVIEW_SECTION_ID}
                      onClickTarget={scrollToSection}
                    />
                  ) : null}
                  {currentTaxFormType && currentTaxFormStatus && currentTaxFormStatus !== "completed" ? (
                    <StatusRow
                      label={getTaxFormLabel(currentTaxFormType)}
                      complete={false}
                      targetId={TAX_FORM_SECTION_ID}
                      onClickTarget={scrollToSection}
                    />
                  ) : null}
                </div>
              </div>

              <div
                id={JOB_ACCEPTANCE_SECTION_ID}
                className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <h3 className="text-lg font-bold text-slate-900">What happens next</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  After this page is saved, the employee continues to Step 5 training and
                  completes the remaining onboarding items before final review.
                </p>
              </div>
            </aside>

            <section className="space-y-6">
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                      Required Review
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">
                      Employee Handbook
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      Review the Saintly Home Health Employee Handbook and confirm your
                      acknowledgment in the onboarding portal. You can open the handbook again here
                      at any time while completing this step.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Handbook acknowledgment is tracked on this page as part of your required Step
                      4 completion items.
                    </p>
                  </div>

                  <a
                    href="/employee-handbook.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Download Handbook
                  </a>
                </div>
              </div>

              <div
                id={I9_SECTION_ID}
                className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                      Position Selection
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">
                      Choose your job description
                    </h2>
                  </div>
                </div>

                <div className="grid gap-3">
                  {ROLE_OPTIONS.map((role) => {
                    const isSelected = form.selectedRole === role.key;

                    return (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => handleRoleChange(role.key)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-teal-300 bg-teal-50 shadow-[0_10px_30px_rgba(15,118,110,0.10)]"
                            : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                              isSelected
                                ? "bg-teal-700 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {role.badge}
                          </span>
                          <span className="text-lg font-semibold text-slate-900">
                            {role.label}
                          </span>
                        </div>

                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {role.summary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                  Contract Summary
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  {selectedRoleConfig
                    ? selectedRoleConfig.label
                    : "Select a role to review"}
                </h2>

                {selectedRoleConfig ? (
                  <>
                    <p className="mt-3 rounded-2xl border border-teal-100 bg-teal-50/40 px-4 py-3 text-sm leading-6 text-slate-700">
                      {selectedRoleConfig.summary}
                    </p>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Core Responsibilities
                      </h3>

                      <ul className="mt-4 space-y-3">
                        {selectedRoleConfig.description.map((item, index) => (
                          <li key={index} className="flex gap-3">
                            <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">
                              ✓
                            </span>
                            <span className="text-sm leading-6 text-slate-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm leading-6 text-slate-500">
                    Once you choose a position on the left, the matching Saintly Home Health
                    job description will appear here for review.
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                  Required Acknowledgments
                </p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  Confirm the following before continuing
                </h2>

                <div className="mt-6 space-y-4">
                  <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
                    <input
                      type="checkbox"
                      checked={form.handbookAcknowledged}
                      onChange={() => handleCheckboxChange("handbookAcknowledged")}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">
                        Employee Handbook Acknowledgment
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        I acknowledge that I have reviewed or received access to the Saintly
                        Home Health employee handbook and understand I am responsible for
                        following agency standards, professionalism, and compliance
                        expectations.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
                    <input
                      type="checkbox"
                      checked={form.policiesAcknowledged}
                      onChange={() => handleCheckboxChange("policiesAcknowledged")}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">
                        Conflict of Interest / Confidentiality
                      </p>
                      <div className="mt-1 space-y-3 text-sm leading-6 text-slate-600">
                        <p>
                          I have read and am fully familiar with the Agency&apos;s policy statement
                          regarding conflict of interest. I am not presently involved in any
                          transaction, investment, or other matter in which I would profit or gain
                          directly or indirectly as a result of my employment with the Agency. I
                          will disclose all known relationships that may present a conflict of
                          interest. Furthermore, I agree to immediately disclose any such interest
                          or outside employment which may occur in accordance with the requirements
                          of the policy and agree to abstain from any vote or action regarding the
                          Agency&apos;s business that might result in any profit or gain, directly
                          or indirectly for myself.
                        </p>
                        <p>
                          I understand that patient privacy and Protected Health Information must
                          be maintained at all times. Any information related to the care of
                          patients through Saintly Home Health LLC will be held confidential. All
                          information, written or verbal, will be disclosed only to appropriate
                          health care personnel, appropriate staff, those with a need-to-know
                          basis, or to individuals the patient requests.
                        </p>
                      </div>
                    </div>
                  </label>

                  <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
                    <input
                      type="checkbox"
                      checked={form.jobDescriptionAcknowledged}
                      onChange={() => handleCheckboxChange("jobDescriptionAcknowledged")}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">
                        Electronic Documentation Signature Agreement
                      </p>
                      <div className="mt-1 space-y-3 text-sm leading-6 text-slate-600">
                        <p>
                          I understand that Agency staff may use electronic signatures on
                          computer-generated documentation. An electronic signature serves as
                          authentication on patient record documents and other agency documents
                          generated in the electronic system.
                        </p>
                        <p>
                          For the purpose of the computerized medical record and other agency
                          documentation, I acknowledge that my login authentication password and
                          signature passcode serve as my legal signature. I understand that I must
                          not divulge my password or signature passcode, must securely exit the
                          application whenever it is not in my possession, and must review my
                          documentation before submitting it to the agency system.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                    Electronic Signature
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">
                    Sign to complete Step 4
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    By typing your full legal name below, you are electronically signing
                    this onboarding acknowledgment and confirming that the information above
                    is accurate.
                  </p>

                  <div className="mt-5">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Full legal name
                    </label>
                    <input
                      type="text"
                      value={form.electronicSignature}
                      onChange={(e) => handleSignatureChange(e.target.value)}
                      placeholder="Type your full name"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                      Portal Form
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">
                      Job Acceptance Statement
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      Complete this statement in the portal to confirm you have read and accepted
                      the terms of the job description for your position.
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      isJobAcceptanceFormComplete
                        ? "bg-teal-50 text-teal-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {isJobAcceptanceFormComplete ? "Completed" : "Missing"}
                  </span>
                </div>

                <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Agreement Text
                    </div>
                    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                      <p>
                        I have read, understand and agree to the terms specified in this job
                        description for the position I presently hold. A copy of this job
                        description has been given to me.
                      </p>
                      <p>
                        I further understand that this job description may be reviewed at any time
                        and that I will be provided with a revised copy.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
                      <input
                        type="checkbox"
                        checked={jobAcceptanceForm.acknowledged}
                        onChange={(event) => {
                          setJobAcceptanceForm((prev) => ({
                            ...prev,
                            acknowledged: event.target.checked,
                          }));
                          setJobAcceptanceFormMessage("");
                          setJobAcceptanceFormError("");
                        }}
                        className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                      />
                      <span className="text-sm leading-6 text-slate-700">
                        I have read and acknowledge the Job Acceptance Statement.
                      </span>
                    </label>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Full legal name
                      </label>
                      <input
                        type="text"
                        value={jobAcceptanceForm.fullName}
                        onChange={(event) => {
                          setJobAcceptanceForm((prev) => ({
                            ...prev,
                            fullName: event.target.value,
                          }));
                          setJobAcceptanceFormMessage("");
                          setJobAcceptanceFormError("");
                        }}
                        placeholder="Type your full legal name"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Date
                      </label>
                      <input
                        type="date"
                        value={jobAcceptanceForm.signedDate}
                        onChange={(event) => {
                          setJobAcceptanceForm((prev) => ({
                            ...prev,
                            signedDate: event.target.value,
                          }));
                          setJobAcceptanceFormMessage("");
                          setJobAcceptanceFormError("");
                        }}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleJobAcceptanceFormSave}
                      disabled={isSavingJobAcceptanceForm}
                      className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingJobAcceptanceForm ? "Saving..." : "Save Form"}
                    </button>

                    {(jobAcceptanceFormError || jobAcceptanceFormMessage) && (
                      <div
                        className={`rounded-2xl border p-4 text-sm ${
                          jobAcceptanceFormError
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {jobAcceptanceFormError || jobAcceptanceFormMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                      Portal Form
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">
                      Form I-9 — Section 1 (Employee Information and Attestation)
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      Complete Section 1 as the employee.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Section 1 must be completed no later than the first day of employment, but
                      not before accepting a job offer.
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      isI9Section1FormComplete
                        ? "bg-teal-50 text-teal-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {isI9Section1FormComplete ? "Completed" : "Missing"}
                  </span>
                </div>

                <div className="mt-6 space-y-5 rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Section 1 Instructions
                    </div>
                    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                      <p>
                        Employees must complete and sign Section 1 of Form I-9 no later than the
                        first day of employment, but not before accepting a job offer.
                      </p>
                      <p>
                        You attest, under penalty of perjury, that the information entered is true
                        and correct and that you are authorized to work in the United States.
                      </p>
                      <p>
                        If a preparer and/or translator assisted you in completing Section 1, you
                        must indicate that assistance below and provide the required preparer or
                        translator information.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Employee Information
                    </div>

                    {[
                      ["Last Name", "lastName", "text"],
                      ["First Name", "firstName", "text"],
                      ["Middle Initial", "middleInitial", "text"],
                      ["Other Last Names Used", "otherLastNames", "text"],
                      ["Street Address", "streetAddress", "text"],
                      ["Apt Number", "aptNumber", "text"],
                      ["City or Town", "city", "text"],
                      ["State", "state", "text"],
                      ["ZIP Code", "zipCode", "text"],
                      ["Date of Birth", "dateOfBirth", "date"],
                      ["U.S. Social Security Number", "ssn", "text"],
                      ["Employee Email Address", "email", "email"],
                      ["Employee Telephone Number", "phone", "text"],
                    ].map(([label, key, type]) => (
                      <div key={String(key)}>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                          {label}
                        </label>
                        <input
                          type={String(type)}
                          value={i9Section1Form[key as keyof I9Section1FormData] as string}
                          onChange={(event) => {
                            setI9Section1Form((prev) => ({
                              ...prev,
                              [key]: event.target.value,
                            }));
                            setI9Section1FormMessage("");
                            setI9Section1FormError("");
                          }}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Employee Attestation
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                        Federal Compliance Statement
                      </div>
                      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">
                        <p>
                          I am aware that federal law provides for imprisonment and/or fines for
                          false statements, or the use of false documents, in connection with the
                          completion of this form.
                        </p>
                        <p>
                          I attest, under penalty of perjury, that this information, including my
                          selection of the box attesting to my citizenship or immigration status,
                          is true and correct.
                        </p>
                      </div>
                    </div>

                    {[
                      ["citizen", "A citizen of the United States"],
                      [
                        "noncitizen_national",
                        "A noncitizen national of the United States",
                      ],
                      [
                        "lawful_permanent_resident",
                        "A lawful permanent resident (enter USCIS or A-number)",
                      ],
                      [
                        "alien_authorized",
                        "An alien authorized to work (enter expiration + ID fields)",
                      ],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50/30"
                      >
                        <input
                          type="radio"
                          name="i9AttestStatus"
                          checked={i9Section1Form.attestStatus === value}
                          onChange={() => {
                            setI9Section1Form((prev) => ({
                              ...prev,
                              attestStatus: value as I9Section1FormData["attestStatus"],
                            }));
                            setI9Section1FormMessage("");
                            setI9Section1FormError("");
                          }}
                          className="mt-1 h-5 w-5 border-slate-300 text-teal-700 focus:ring-teal-500"
                        />
                        <span className="text-sm leading-6 text-slate-700">{label}</span>
                      </label>
                    ))}

                    {i9Section1Form.attestStatus === "lawful_permanent_resident" && (
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">
                          USCIS or A-Number
                        </label>
                        <input
                          type="text"
                          value={i9Section1Form.lprANumber}
                          onChange={(event) => {
                            setI9Section1Form((prev) => ({
                              ...prev,
                              lprANumber: event.target.value,
                            }));
                            setI9Section1FormMessage("");
                            setI9Section1FormError("");
                          }}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                        />
                      </div>
                    )}

                    {i9Section1Form.attestStatus === "alien_authorized" && (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Work Authorization Expiration Date
                          </label>
                          <input
                            type="date"
                            value={i9Section1Form.alienWorkUntil}
                            onChange={(event) => {
                              setI9Section1Form((prev) => ({
                                ...prev,
                                alienWorkUntil: event.target.value,
                              }));
                              setI9Section1FormMessage("");
                              setI9Section1FormError("");
                            }}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-slate-700">
                            Identification Number Type
                          </label>
                          <select
                            value={i9Section1Form.alienIdType}
                            onChange={(event) => {
                              setI9Section1Form((prev) => ({
                                ...prev,
                                alienIdType: event.target.value as I9Section1FormData["alienIdType"],
                              }));
                              setI9Section1FormMessage("");
                              setI9Section1FormError("");
                            }}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                          >
                            <option value="">Select</option>
                            <option value="a_number">USCIS A-Number</option>
                            <option value="i94">Form I-94 Admission Number</option>
                            <option value="foreign_passport">Foreign Passport Number</option>
                          </select>
                        </div>

                        {i9Section1Form.alienIdType === "a_number" && (
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                              USCIS A-Number
                            </label>
                            <input
                              type="text"
                              value={i9Section1Form.alienANumber}
                              onChange={(event) => {
                                setI9Section1Form((prev) => ({
                                  ...prev,
                                  alienANumber: event.target.value,
                                }));
                                setI9Section1FormMessage("");
                                setI9Section1FormError("");
                              }}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                            />
                          </div>
                        )}

                        {i9Section1Form.alienIdType === "i94" && (
                          <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                              Form I-94 Admission Number
                            </label>
                            <input
                              type="text"
                              value={i9Section1Form.i94Number}
                              onChange={(event) => {
                                setI9Section1Form((prev) => ({
                                  ...prev,
                                  i94Number: event.target.value,
                                }));
                                setI9Section1FormMessage("");
                                setI9Section1FormError("");
                              }}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                            />
                          </div>
                        )}

                        {i9Section1Form.alienIdType === "foreign_passport" && (
                          <>
                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-700">
                                Foreign Passport Number
                              </label>
                              <input
                                type="text"
                                value={i9Section1Form.foreignPassportNumber}
                                onChange={(event) => {
                                  setI9Section1Form((prev) => ({
                                    ...prev,
                                    foreignPassportNumber: event.target.value,
                                  }));
                                  setI9Section1FormMessage("");
                                  setI9Section1FormError("");
                                }}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                              />
                            </div>

                            <div>
                              <label className="mb-2 block text-sm font-semibold text-slate-700">
                                Country of Issuance
                              </label>
                              <input
                                type="text"
                                value={i9Section1Form.passportCountry}
                                onChange={(event) => {
                                  setI9Section1Form((prev) => ({
                                    ...prev,
                                    passportCountry: event.target.value,
                                  }));
                                  setI9Section1FormMessage("");
                                  setI9Section1FormError("");
                                }}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                              />
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Preparer and/or Translator
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        Did a preparer and/or translator assist you in completing Section 1?
                      </label>
                      <select
                        value={i9Section1Form.preparerUsed}
                        onChange={(event) => {
                          setI9Section1Form((prev) => ({
                            ...prev,
                            preparerUsed: event.target.value as YesNoValue,
                          }));
                          setI9Section1FormMessage("");
                          setI9Section1FormError("");
                        }}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                      >
                        <option value="">Select</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>

                    {i9Section1Form.preparerUsed === "yes" && (
                      <>
                        {[
                          ["Preparer/Translator Full Name", "preparerFullName"],
                          ["Street Address", "preparerStreet"],
                          ["City or Town", "preparerCity"],
                          ["State", "preparerState"],
                          ["ZIP Code", "preparerZip"],
                        ].map(([label, key]) => (
                          <div key={String(key)}>
                            <label className="mb-2 block text-sm font-semibold text-slate-700">
                              {label}
                            </label>
                            <input
                              type="text"
                              value={i9Section1Form[key as keyof I9Section1FormData] as string}
                              onChange={(event) => {
                                setI9Section1Form((prev) => ({
                                  ...prev,
                                  [key]: event.target.value,
                                }));
                                setI9Section1FormMessage("");
                                setI9Section1FormError("");
                              }}
                              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Employee Certification
                    </div>
                    <div className="mt-3 text-sm leading-7 text-slate-600">
                      By signing below, you attest, under penalty of perjury, that the
                      information you provided in Section 1 is true and correct and that you are
                      authorized to work in the United States.
                    </div>
                  </div>

                  <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50/30">
                    <input
                      type="checkbox"
                      checked={i9Section1Form.employeeAck}
                      onChange={(event) => {
                        setI9Section1Form((prev) => ({
                          ...prev,
                          employeeAck: event.target.checked,
                        }));
                        setI9Section1FormMessage("");
                        setI9Section1FormError("");
                      }}
                      className="mt-1 h-5 w-5 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    />
                    <span className="text-sm leading-6 text-slate-700">
                      I acknowledge that I have completed Form I-9 Section 1 as the employee and
                      that the information above is true and correct.
                    </span>
                  </label>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Employee full legal name
                    </label>
                    <input
                      type="text"
                      value={i9Section1Form.employeeFullName}
                      onChange={(event) => {
                        setI9Section1Form((prev) => ({
                          ...prev,
                          employeeFullName: event.target.value,
                        }));
                        setI9Section1FormMessage("");
                        setI9Section1FormError("");
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Date signed
                    </label>
                    <input
                      type="date"
                      value={i9Section1Form.signedDate}
                      onChange={(event) => {
                        setI9Section1Form((prev) => ({
                          ...prev,
                          signedDate: event.target.value,
                        }));
                        setI9Section1FormMessage("");
                        setI9Section1FormError("");
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      onClick={handleI9Section1FormSave}
                      disabled={isSavingI9Section1Form}
                      className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingI9Section1Form ? "Saving..." : "Save Form"}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadI9Section1Pdf}
                      disabled={isDownloadingI9Pdf}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isDownloadingI9Pdf ? "Generating..." : "Download I-9 PDF"}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadFullHiringPacketPdf}
                      disabled={isDownloadingHiringPacketPdf}
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isDownloadingHiringPacketPdf
                        ? "Generating..."
                        : "Download Full Hiring Packet PDF"}
                    </button>
                  </div>

                  {(i9Section1FormError || i9Section1FormMessage) && (
                    <div
                      className={`rounded-2xl border p-4 text-sm ${
                        i9Section1FormError
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {i9Section1FormError || i9Section1FormMessage}
                    </div>
                  )}
                </div>
              </div>

              {applicantId ? (
                <EmployeeContractReviewCard
                  applicantId={applicantId}
                  sectionId={CONTRACT_REVIEW_SECTION_ID}
                />
              ) : null}

              {applicantId ? (
                <EmployeeTaxFormCard
                  applicantId={applicantId}
                  sectionId={TAX_FORM_SECTION_ID}
                />
              ) : null}

              <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Next Step
                    </div>
                    <h3 className="mt-2 text-2xl font-bold text-slate-900">
                      Save contracts and continue
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                      When all required acknowledgments and forms are complete, save this step and
                      continue to training.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Link
                      href="/onboarding-documents"
                      className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-50"
                    >
                      Back to Step 3
                    </Link>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!canContinueToTraining || isSaving}
                      className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSaving ? "Saving..." : "Continue to Step 5"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusRow({
  label,
  complete,
  targetId,
  onClickTarget,
}: {
  label: string;
  complete: boolean;
  targetId?: string;
  onClickTarget?: (targetId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (targetId && onClickTarget) {
          onClickTarget(targetId);
        }
      }}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left disabled:cursor-default"
      disabled={!targetId || !onClickTarget}
    >
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          complete ? "bg-teal-50 text-teal-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {complete ? "Complete" : "Pending"}
      </span>
    </button>
  );
}
