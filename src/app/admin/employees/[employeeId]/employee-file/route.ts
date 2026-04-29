import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
import {
  formatCurrency,
  formatEmploymentClassificationLabel,
  formatEmploymentTypeLabel,
  formatMileageTypeLabel,
  formatPayTypeLabel,
} from "@/lib/employee-contracts";
import { getTaxFormLabel, normalizeTaxFormData } from "@/lib/employee-tax-forms";
import { insertAuditLog } from "@/lib/audit-log";
import { calculateTrainingCompletionSummary } from "@/lib/onboarding/training-status";

type SupportedDocumentType =
  | "full"
  | "contract"
  | "employment_contract"
  | "tax"
  | "training"
  | "application"
  | "employee_handbook"
  | "job_acceptance"
  | "i9"
  | "conflict_of_interest"
  | "electronic_signature_agreement"
  | "hepatitis_b_declination"
  | "tb_risk_assessment";

type ApplicantRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  position?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type OnboardingContractRow = {
  selected_role?: string | null;
  role_title?: string | null;
  role_description?: string | null;
  completed?: boolean | null;
  signed_at?: string | null;
  handbook_acknowledged?: boolean | null;
  job_description_acknowledged?: boolean | null;
  policies_acknowledged?: boolean | null;
  electronic_signature?: string | null;
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
  created_at?: string | null;
};

type EmployeeContractPdfRow = {
  role_label?: string | null;
  employment_classification?: "employee" | "contractor" | null;
  employment_type?: "prn" | "part_time" | "full_time" | null;
  pay_type?: "per_visit" | "hourly" | "salary" | null;
  pay_rate?: number | null;
  mileage_type?: "none" | "per_mile" | null;
  mileage_rate?: number | null;
  effective_date?: string | null;
  contract_status?: "draft" | "sent" | "signed" | "void" | null;
  contract_text_snapshot?: string | null;
  admin_prepared_by?: string | null;
  admin_prepared_at?: string | null;
  employee_signed_name?: string | null;
  employee_signed_at?: string | null;
  version_number?: number | null;
  updated_at?: string | null;
};

type EmployeeTaxFormPdfRow = {
  form_type?: "w4" | "w9" | null;
  form_status?: string | null;
  employment_classification?: "employee" | "contractor" | null;
  form_data?: Record<string, unknown> | null;
  admin_sent_by?: string | null;
  admin_sent_at?: string | null;
  employee_signed_name?: string | null;
  employee_signed_at?: string | null;
  updated_at?: string | null;
};

type TrainingCompletionRow = {
  module_id: string;
  score: number | null;
  passed: boolean | null;
  completed_at: string | null;
};

type TrainingModuleRow = {
  id: string;
  key?: string | null;
  title?: string | null;
  sort_order?: number | null;
  pass_score?: number | null;
};

type ComplianceEventRow = {
  event_type?: string | null;
  event_title?: string | null;
  status?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
};

type TrainingPdfRow = TrainingCompletionRow & {
  module_title: string;
  module_sort_order: number;
};

type PassedTrainingAttemptRow = {
  module_id: string;
  score: number | null;
  passed: boolean | null;
  completed_at: string | null;
};

function shouldSaveSnapshot(value: string | null) {
  return value === "1" || value === "true";
}

function shouldInlinePdf(value: string | null) {
  return value === "1" || value === "true";
}

function getDocumentType(value: string | null): SupportedDocumentType {
  if (
    value === "contract" ||
    value === "employment_contract" ||
    value === "tax" ||
    value === "training" ||
    value === "application" ||
    value === "employee_handbook" ||
    value === "job_acceptance" ||
    value === "i9" ||
    value === "conflict_of_interest" ||
    value === "electronic_signature_agreement" ||
    value === "hepatitis_b_declination" ||
    value === "tb_risk_assessment"
  ) {
    return value;
  }

  return "full";
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(", ");
  }

  return String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getEmployeeName(employee: ApplicantRow | null) {
  return [employee?.first_name, employee?.last_name].filter(Boolean).join(" ").trim();
}

function getSafeFileToken(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || fallback;
}

function getBinaryStatusLabel(isCompleted: boolean) {
  return isCompleted ? "[Completed]" : "[Missing]";
}

function parseRoleDescriptionLines(value?: string | null) {
  if (!value?.trim()) return [] as string[];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    return value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function isComplianceEventCompleted(event: ComplianceEventRow) {
  const normalizedStatus = (event.status || "").trim().toLowerCase();

  return (
    Boolean(event.completed_at) ||
    normalizedStatus === "completed" ||
    normalizedStatus === "complete" ||
    normalizedStatus === "passed" ||
    normalizedStatus === "verified" ||
    normalizedStatus === "cleared" ||
    normalizedStatus === "clear" ||
    normalizedStatus === "current" ||
    normalizedStatus === "active" ||
    normalizedStatus === "compliant"
  );
}

function hasCompletedComplianceEvent(events: ComplianceEventRow[], matchers: string[]) {
  return events.some((event) => {
    const haystack = `${event.event_type || ""} ${event.event_title || ""}`.toLowerCase();
    return matchers.some((matcher) => haystack.includes(matcher)) && isComplianceEventCompleted(event);
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ employeeId?: string; id?: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await context.params;
  const employeeId = resolvedParams.employeeId || resolvedParams.id;
  const requestUrl = new URL(request.url);
  const documentType = getDocumentType(requestUrl.searchParams.get("document"));
  const saveSnapshot = shouldSaveSnapshot(requestUrl.searchParams.get("save"));
  const inlinePdf = shouldInlinePdf(requestUrl.searchParams.get("inline"));

  if (!employeeId) {
    return NextResponse.json({ error: "Invalid employee ID" }, { status: 400 });
  }

  if (saveSnapshot) {
    const staffProfile = await getStaffProfile();
    if (!isAdminOrHigher(staffProfile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const [
      { data: employee, error: employeeError },
      { data: onboardingContract, error: onboardingContractError },
      { data: employeeContract, error: employeeContractError },
      { data: employeeTaxForm, error: employeeTaxFormError },
      { data: trainingCompletions, error: trainingCompletionsError },
      { data: trainingModules, error: trainingModulesError },
      { data: complianceEvents, error: complianceEventsError },
      { data: employeeTrainingAttempts, error: employeeTrainingAttemptsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("applicants")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle<ApplicantRow & Record<string, unknown>>(),
      supabaseAdmin
        .from("onboarding_contracts")
        .select(
          "selected_role, role_title, role_description, completed, signed_at, handbook_acknowledged, job_description_acknowledged, policies_acknowledged, electronic_signature, job_acceptance_acknowledged, job_acceptance_full_name, job_acceptance_signed_at, i9_s1_last_name, i9_s1_first_name, i9_s1_middle_initial, i9_s1_other_last_names, i9_s1_street_address, i9_s1_apt_number, i9_s1_city, i9_s1_state, i9_s1_zip_code, i9_s1_dob, i9_s1_ssn, i9_s1_email, i9_s1_phone, i9_s1_attest_status, i9_s1_lpr_a_number, i9_s1_alien_work_until, i9_s1_alien_id_type, i9_s1_alien_a_number, i9_s1_i94_number, i9_s1_foreign_passport_number, i9_s1_passport_country, i9_s1_prep_used, i9_s1_prep_full_name, i9_s1_prep_street, i9_s1_prep_city, i9_s1_prep_state, i9_s1_prep_zip, i9_s1_employee_ack, i9_s1_employee_full_name, i9_s1_signed_at, conflict_confidentiality_acknowledged, conflict_confidentiality_disclosure, conflict_confidentiality_full_name, conflict_confidentiality_signed_at, electronic_signature_agreement_acknowledged, electronic_signature_agreement_full_name, electronic_signature_agreement_signed_at, hep_b_declination_acknowledged, hep_b_declination_full_name, hep_b_declination_signed_at, tb_history_positive_test_or_infection, tb_history_bcg_vaccine, tb_symptom_prolonged_recurrent_fever, tb_symptom_recent_weight_loss, tb_symptom_chronic_cough, tb_symptom_coughing_blood, tb_symptom_night_sweats, tb_risk_silicosis, tb_risk_gastrectomy, tb_risk_intestinal_bypass, tb_risk_weight_10_percent_below_ideal, tb_risk_chronic_renal_disease, tb_risk_diabetes_mellitus, tb_risk_steroid_or_immunosuppressive_therapy, tb_risk_hematologic_disorder, tb_risk_exposure_to_hiv_or_aids, tb_risk_other_malignancies, tb_baseline_residence_high_tb_country, tb_baseline_current_or_planned_immunosuppression, tb_baseline_close_contact_with_infectious_tb, tb_additional_comments, tb_acknowledged, tb_full_name, tb_signed_at, created_at"
        )
        .eq("applicant_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<OnboardingContractRow>(),
      supabaseAdmin
        .from("employee_contracts")
        .select(
          "role_label, employment_classification, employment_type, pay_type, pay_rate, mileage_type, mileage_rate, effective_date, contract_status, contract_text_snapshot, admin_prepared_by, admin_prepared_at, employee_signed_name, employee_signed_at, version_number, updated_at"
        )
        .eq("applicant_id", employeeId)
        .eq("is_current", true)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle<EmployeeContractPdfRow>(),
      supabaseAdmin
        .from("employee_tax_forms")
        .select(
          "form_type, form_status, employment_classification, form_data, admin_sent_by, admin_sent_at, employee_signed_name, employee_signed_at, updated_at"
        )
        .eq("applicant_id", employeeId)
        .eq("is_current", true)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle<EmployeeTaxFormPdfRow>(),
      supabaseAdmin
        .from("employee_training_completions")
        .select("module_id, score, passed, completed_at")
        .eq("applicant_id", employeeId)
        .order("completed_at", { ascending: true }),
      supabaseAdmin
        .from("training_modules")
        .select("id, key, title, sort_order, pass_score"),
      supabaseAdmin
        .from("admin_compliance_events")
        .select("event_type, event_title, status, due_date, completed_at, created_at")
        .eq("applicant_id", employeeId)
        .order("due_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("employee_training_attempts")
        .select("module_id, score, passed, completed_at, created_at")
        .eq("applicant_id", employeeId)
        .eq("passed", true)
        .order("completed_at", { ascending: false }),
    ]);

    const queryError = [
      employeeError,
      onboardingContractError,
      employeeContractError,
      employeeTaxFormError,
      trainingCompletionsError,
      trainingModulesError,
      complianceEventsError,
      employeeTrainingAttemptsError,
    ].find(Boolean);

    if (queryError) {
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const employeeName = getEmployeeName(employee);
    const safeEmployeeName = getSafeFileToken(employeeName || employee.id, "employee");
    const moduleMap = ((trainingModules || []) as TrainingModuleRow[]).reduce<
      Record<string, TrainingModuleRow>
    >((accumulator, module) => {
      accumulator[module.id] = module;
      return accumulator;
    }, {});

    const trainingSummary = calculateTrainingCompletionSummary({
      modules: (trainingModules || []) as TrainingModuleRow[],
      attempts: (employeeTrainingAttempts || []) as PassedTrainingAttemptRow[],
      completions: (trainingCompletions || []) as TrainingCompletionRow[],
    });

    let trainingRows = ((trainingCompletions || []) as TrainingCompletionRow[])
      .map((row) => ({
        ...row,
        module_title:
          moduleMap[row.module_id]?.title || moduleMap[row.module_id]?.key || row.module_id,
        module_sort_order: moduleMap[row.module_id]?.sort_order ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((left, right) => left.module_sort_order - right.module_sort_order) as TrainingPdfRow[];

    if (trainingRows.length === 0 && trainingSummary.isComplete) {
      const attempts = (employeeTrainingAttempts || []) as PassedTrainingAttemptRow[];
      const latestByModule = new Map<string, PassedTrainingAttemptRow>();
      for (const attempt of attempts) {
        if (!latestByModule.has(attempt.module_id)) {
          latestByModule.set(attempt.module_id, attempt);
        }
      }
      trainingRows = Array.from(latestByModule.values())
        .map((row) => ({
          module_id: row.module_id,
          score: row.score,
          passed: row.passed,
          completed_at: row.completed_at,
          module_title:
            moduleMap[row.module_id]?.title || moduleMap[row.module_id]?.key || row.module_id,
          module_sort_order: moduleMap[row.module_id]?.sort_order ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((left, right) => left.module_sort_order - right.module_sort_order) as TrainingPdfRow[];
    }

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const generatedAt = new Date().toISOString();
    const generatedAtLabel = formatDateTime(generatedAt);
    const margin = 48;
    let y = height - margin;

    const addPage = () => {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    };

    const ensureSpace = (needed = 24) => {
      if (y < margin + needed) {
        addPage();
      }
    };

    const drawText = (
      text: string,
      options?: {
        bold?: boolean;
        size?: number;
        indent?: number;
        color?: ReturnType<typeof rgb>;
      }
    ) => {
      const activeFont = options?.bold ? boldFont : font;
      const size = options?.size ?? 10;
      const indent = options?.indent ?? 0;
      const color = options?.color ?? rgb(0.15, 0.15, 0.2);
      const maxWidth = width - margin * 2 - indent;
      const paragraphs = text.split("\n");

      for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = "";

        if (words.length === 0) {
          y -= size + 6;
          continue;
        }

        for (const word of words) {
          const nextLine = line ? `${line} ${word}` : word;
          const nextWidth = activeFont.widthOfTextAtSize(nextLine, size);

          if (nextWidth > maxWidth && line) {
            ensureSpace(size + 10);
            page.drawText(line, {
              x: margin + indent,
              y,
              size,
              font: activeFont,
              color,
            });
            y -= size + 6;
            line = word;
            continue;
          }

          line = nextLine;
        }

        if (line) {
          ensureSpace(size + 10);
          page.drawText(line, {
            x: margin + indent,
            y,
            size,
            font: activeFont,
            color,
          });
          y -= size + 6;
        }
      }
    };

    const drawSectionTitle = (title: string) => {
      y -= 4;
      drawText(title, {
        bold: true,
        size: 14,
        color: rgb(0.02, 0.39, 0.73),
      });
      y -= 2;
    };

    const drawDivider = () => {
      ensureSpace(16);
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.84, 0.88, 0.93),
      });
      y -= 14;
    };

    const drawField = (label: string, value: unknown, options?: { indent?: number }) => {
      drawText(`${label}: ${formatValue(value)}`, { indent: options?.indent ?? 0 });
    };

    const documentTitle =
      documentType === "contract"
        ? "Employee Contract Packet"
        : documentType === "employment_contract"
          ? "Employment Contract"
          : documentType === "tax"
            ? "Employee Tax Form"
            : documentType === "training"
              ? "Training Certificate"
              : documentType === "application"
                ? "Application Record"
                : documentType === "employee_handbook"
                  ? "Employee Handbook Acknowledgment"
                  : documentType === "job_acceptance"
                    ? "Job Acceptance Statement"
                    : documentType === "i9"
                      ? "Form I-9"
                      : documentType === "conflict_of_interest"
                        ? "Conflict of Interest + Confidentiality"
                        : documentType === "electronic_signature_agreement"
                          ? "Electronic Documentation Signature Agreement"
                          : documentType === "hepatitis_b_declination"
                            ? "Hepatitis B Vaccine Declination"
                            : documentType === "tb_risk_assessment"
                              ? "TB Risk Assessment"
                : "Employee File";

    drawText("Saintly Home Health", {
      bold: true,
      size: 20,
      color: rgb(0.02, 0.39, 0.73),
    });
    drawText(documentTitle, { bold: true, size: 14 });
    drawText(`Generated: ${generatedAtLabel}`);
    drawText(`Employee ID: ${employee.id}`);
    y -= 8;
    drawDivider();

    const complianceSummaryEvents = (complianceEvents || []) as ComplianceEventRow[];
    const trainingComplete = trainingRows.length > 0 && trainingRows.every((row) => row.passed);

    const drawCurrentEmploymentContractOnly = () => {
      drawSectionTitle("Current Employment Contract");
      drawField(
        "Status",
        getBinaryStatusLabel(
          Boolean(
            employeeContract &&
              (employeeContract.contract_status === "signed" ||
                employeeContract.employee_signed_at ||
                employeeContract.employee_signed_name)
          )
        )
      );

      if (!employeeContract) {
        drawText("No current employee contract found.");
      } else {
        drawField("Contract Status", employeeContract.contract_status);
        drawField("Version", employeeContract.version_number);
        drawField("Role", employeeContract.role_label);
        drawField(
          "Classification",
          employeeContract.employment_classification
            ? formatEmploymentClassificationLabel(employeeContract.employment_classification)
            : "—"
        );
        drawField(
          "Employment Type",
          employeeContract.employment_type
            ? formatEmploymentTypeLabel(employeeContract.employment_type)
            : "—"
        );
        drawField(
          "Pay Type",
          employeeContract.pay_type ? formatPayTypeLabel(employeeContract.pay_type) : "—"
        );
        drawField("Pay Rate", formatCurrency(employeeContract.pay_rate));
        drawField(
          "Mileage",
          employeeContract.mileage_type
            ? formatMileageTypeLabel(employeeContract.mileage_type)
            : "—"
        );
        drawField("Mileage Rate", formatCurrency(employeeContract.mileage_rate));
        drawField("Effective Date", formatDate(employeeContract.effective_date));
        drawField("Prepared By", employeeContract.admin_prepared_by);
        drawField("Prepared At", formatDateTime(employeeContract.admin_prepared_at));
        drawField("Employee Signed Name", employeeContract.employee_signed_name);
        drawField("Employee Signed Date", formatDateTime(employeeContract.employee_signed_at));
        drawField("Last Updated", formatDateTime(employeeContract.updated_at));

        if (employeeContract.contract_text_snapshot?.trim()) {
          y -= 4;
          drawText("Contract Text Snapshot", { bold: true, size: 11 });
          employeeContract.contract_text_snapshot
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => {
              drawText(line, { indent: 12, size: 9 });
            });
        }
      }

      drawDivider();
    };

    const drawTrainingCertificateBody = () => {
      drawSectionTitle("Training Certificate");
      drawField("Status", getBinaryStatusLabel(trainingComplete));

      if (trainingRows.length === 0) {
        drawText("No training completion records found.");
      } else {
        const passedCount = trainingRows.filter((row) => row.passed).length;
        drawField("Completed Modules", `${passedCount} of ${trainingRows.length}`);
        drawField(
          "Certificate Status",
          passedCount === trainingRows.length ? "Completed" : "Incomplete"
        );
        y -= 4;

        trainingRows.forEach((row, index) => {
          drawText(`${index + 1}. ${formatValue(row.module_title)}`, {
            bold: true,
            size: 11,
          });
          drawField("Passed", row.passed, { indent: 12 });
          drawField("Score", row.score === null ? "—" : `${row.score}%`, { indent: 12 });
          drawField("Completed At", formatDateTime(row.completed_at), { indent: 12 });
          y -= 4;
        });

        y -= 4;
        drawText(
          "This certifies that the employee completed Saintly Home Health training currently recorded in the system."
        );
      }

      drawDivider();
    };

    const drawRoleBreakdown = () => {
      if (!onboardingContract) return;
      const roleSummary = parseRoleDescriptionLines(onboardingContract.role_description);
      drawField("Role Title", onboardingContract.role_title || onboardingContract.selected_role);
      if (employee.position) {
        drawField("Role / Discipline", employee.position);
      }
      if (roleSummary.length > 0) {
        drawText("Core Responsibilities", { bold: true, size: 11 });
        roleSummary.forEach((line, index) => {
          drawText(`${index + 1}. ${line}`, { indent: 12, size: 9 });
        });
      }
    };

    const drawPortalFormSection = (input: {
      title: string;
      intro: string[];
      acknowledged: boolean;
      signerName?: string | null;
      signedAt?: string | null;
      completionAt?: string | null;
      extraFields?: Array<{ label: string; value: unknown }>;
      includeRoleBreakdown?: boolean;
    }) => {
      drawSectionTitle(input.title);
      drawField("Employee Name", employeeName || "—");
      drawField("Role / Discipline", employee.position || onboardingContract?.role_title || "—");
      input.intro.forEach((paragraph) => drawText(paragraph));
      if (input.includeRoleBreakdown) {
        y -= 4;
        drawRoleBreakdown();
      }
      if (input.extraFields?.length) {
        y -= 4;
        input.extraFields.forEach((field) => drawField(field.label, field.value));
      }
      drawField("Acknowledged", input.acknowledged ? "Checked / Yes" : "Missing");
      drawField("Employee Full Legal Name", input.signerName || "—");
      drawField("Signed Date", formatDate(input.signedAt));
      drawField("Completion Timestamp", formatDateTime(input.completionAt || input.signedAt));
      drawDivider();
    };

    if (documentType === "application") {
      drawSectionTitle("Application Information");
      const applicantData = employee as Record<string, unknown>;
      const sortedKeys = Object.keys(applicantData).sort((a, b) => a.localeCompare(b));
      for (const key of sortedKeys) {
        const value = applicantData[key];
        if (value === null || value === undefined || value === "") continue;
        drawField(formatLabel(key), value);
      }
    } else if (documentType === "employment_contract") {
      drawSectionTitle("Employee Information");
      drawField("Employee Name", employeeName || "—");
      drawField("Employee ID", employee.id);
      drawDivider();
      drawCurrentEmploymentContractOnly();
    } else if (documentType === "training") {
      drawSectionTitle("Employee Information");
      drawField("Employee Name", employeeName || "—");
      drawField("Employee ID", employee.id);
      drawDivider();
      drawTrainingCertificateBody();
    } else if (documentType === "employee_handbook") {
      drawPortalFormSection({
        title: "Employee Handbook Acknowledgment",
        intro: [
          "I acknowledge that I have reviewed or received access to the Saintly Home Health employee handbook and understand I am responsible for following agency standards, professionalism, and compliance expectations.",
        ],
        acknowledged: onboardingContract?.handbook_acknowledged === true,
        signerName:
          onboardingContract?.job_acceptance_full_name ||
          onboardingContract?.electronic_signature ||
          employeeName ||
          "—",
        signedAt: onboardingContract?.signed_at,
        completionAt: onboardingContract?.signed_at,
      });
    } else if (documentType === "job_acceptance") {
      drawPortalFormSection({
        title: "Job Acceptance Statement",
        intro: [
          "I have read, understand and agree to the terms specified in this job description for the position I presently hold. A copy of this job description has been given to me.",
          "I further understand that this job description may be reviewed at any time and that I will be provided with a revised copy.",
        ],
        acknowledged: onboardingContract?.job_acceptance_acknowledged === true,
        signerName: onboardingContract?.job_acceptance_full_name,
        signedAt: onboardingContract?.job_acceptance_signed_at,
        completionAt: onboardingContract?.job_acceptance_signed_at,
        includeRoleBreakdown: true,
      });
    } else if (documentType === "i9") {
      drawPortalFormSection({
        title: "Form I-9 — Section 1",
        intro: [
          "Employees must complete and sign Section 1 of Form I-9 no later than the first day of employment and attest, under penalty of perjury, that the information they provided is true and correct.",
        ],
        acknowledged: onboardingContract?.i9_s1_employee_ack === true,
        signerName: onboardingContract?.i9_s1_employee_full_name,
        signedAt: onboardingContract?.i9_s1_signed_at,
        completionAt: onboardingContract?.i9_s1_signed_at,
        extraFields: [
          {
            label: "Employee Name",
            value: [
              onboardingContract?.i9_s1_first_name,
              onboardingContract?.i9_s1_middle_initial,
              onboardingContract?.i9_s1_last_name,
            ]
              .filter(Boolean)
              .join(" "),
          },
          { label: "Street Address", value: onboardingContract?.i9_s1_street_address },
          { label: "City", value: onboardingContract?.i9_s1_city },
          { label: "State", value: onboardingContract?.i9_s1_state },
          { label: "ZIP Code", value: onboardingContract?.i9_s1_zip_code },
          { label: "Date of Birth", value: formatDate(onboardingContract?.i9_s1_dob) },
          { label: "Social Security Number", value: onboardingContract?.i9_s1_ssn },
          { label: "Email Address", value: onboardingContract?.i9_s1_email },
          { label: "Telephone Number", value: onboardingContract?.i9_s1_phone },
          { label: "Citizenship / Attestation", value: onboardingContract?.i9_s1_attest_status },
        ],
      });
    } else if (documentType === "conflict_of_interest") {
      drawPortalFormSection({
        title: "Conflict of Interest + Confidentiality",
        intro: [
          "I have read and am fully familiar with the Agency's policy statement regarding conflict of interest.",
          "I understand that patient privacy and Protected Health Information must be maintained at all times and will only be disclosed to appropriate personnel on a need-to-know basis.",
        ],
        acknowledged: onboardingContract?.conflict_confidentiality_acknowledged === true,
        signerName: onboardingContract?.conflict_confidentiality_full_name,
        signedAt: onboardingContract?.conflict_confidentiality_signed_at,
        completionAt: onboardingContract?.conflict_confidentiality_signed_at,
        extraFields: [
          {
            label: "Disclosure / Outside Interest",
            value: onboardingContract?.conflict_confidentiality_disclosure,
          },
        ],
      });
    } else if (documentType === "electronic_signature_agreement") {
      drawPortalFormSection({
        title: "Electronic Documentation Signature Agreement",
        intro: [
          "I understand that Agency staff may use electronic signatures on computer-generated documentation.",
          "For the purpose of the computerized medical record and other agency documentation, I acknowledge that my login authentication password and signature passcode serve as my legal signature.",
        ],
        acknowledged:
          onboardingContract?.electronic_signature_agreement_acknowledged === true,
        signerName: onboardingContract?.electronic_signature_agreement_full_name,
        signedAt: onboardingContract?.electronic_signature_agreement_signed_at,
        completionAt: onboardingContract?.electronic_signature_agreement_signed_at,
      });
    } else if (documentType === "hepatitis_b_declination") {
      drawPortalFormSection({
        title: "Hepatitis B Vaccine Declination",
        intro: [
          "I understand that due to my occupational exposure to blood or other potentially infectious materials, I may be at risk of acquiring Hepatitis B virus (HBV) infection.",
          "I have been given the opportunity to be vaccinated with Hepatitis B vaccine at no charge to myself. However, I decline Hepatitis B vaccination at this time.",
        ],
        acknowledged: onboardingContract?.hep_b_declination_acknowledged === true,
        signerName: onboardingContract?.hep_b_declination_full_name,
        signedAt: onboardingContract?.hep_b_declination_signed_at,
        completionAt: onboardingContract?.hep_b_declination_signed_at,
      });
    } else if (documentType === "tb_risk_assessment") {
      const tbRiskFactors = [
        onboardingContract?.tb_risk_silicosis ? "Silicosis" : "",
        onboardingContract?.tb_risk_gastrectomy ? "Gastrectomy" : "",
        onboardingContract?.tb_risk_intestinal_bypass ? "Intestinal bypass" : "",
        onboardingContract?.tb_risk_weight_10_percent_below_ideal
          ? "Weight 10 percent below ideal body weight"
          : "",
        onboardingContract?.tb_risk_chronic_renal_disease ? "Chronic renal disease" : "",
        onboardingContract?.tb_risk_diabetes_mellitus ? "Diabetes mellitus" : "",
        onboardingContract?.tb_risk_steroid_or_immunosuppressive_therapy
          ? "Steroid or immunosuppressive therapy"
          : "",
        onboardingContract?.tb_risk_hematologic_disorder ? "Hematologic disorder" : "",
        onboardingContract?.tb_risk_exposure_to_hiv_or_aids ? "Exposure to HIV or AIDS" : "",
        onboardingContract?.tb_risk_other_malignancies ? "Other malignancies" : "",
      ]
        .filter(Boolean)
        .join(", ");

      drawPortalFormSection({
        title: "TB Risk Assessment",
        intro: [
          "Please complete this tuberculosis questionnaire and risk assessment honestly and completely. This information is used to document TB history, current symptoms, and baseline risk factors in accordance with Saintly Home Health onboarding requirements.",
        ],
        acknowledged: onboardingContract?.tb_acknowledged === true,
        signerName: onboardingContract?.tb_full_name,
        signedAt: onboardingContract?.tb_signed_at,
        completionAt: onboardingContract?.tb_signed_at,
        extraFields: [
          {
            label: "Positive TB skin test or TB infection history",
            value: onboardingContract?.tb_history_positive_test_or_infection,
          },
          { label: "BCG vaccine", value: onboardingContract?.tb_history_bcg_vaccine },
          {
            label: "Prolonged or recurrent fever",
            value: onboardingContract?.tb_symptom_prolonged_recurrent_fever,
          },
          { label: "Recent weight loss", value: onboardingContract?.tb_symptom_recent_weight_loss },
          { label: "Chronic cough", value: onboardingContract?.tb_symptom_chronic_cough },
          { label: "Coughing blood", value: onboardingContract?.tb_symptom_coughing_blood },
          { label: "Night sweats", value: onboardingContract?.tb_symptom_night_sweats },
          { label: "Risk factors", value: tbRiskFactors || "None reported" },
          {
            label: "Residence in high TB rate country",
            value: onboardingContract?.tb_baseline_residence_high_tb_country,
          },
          {
            label: "Current or planned immunosuppression",
            value: onboardingContract?.tb_baseline_current_or_planned_immunosuppression,
          },
          {
            label: "Close contact with infectious TB",
            value: onboardingContract?.tb_baseline_close_contact_with_infectious_tb,
          },
          { label: "Additional comments", value: onboardingContract?.tb_additional_comments },
        ],
      });
    } else {
    drawSectionTitle("Compliance Summary");
    drawField(
      "Skills Competency",
      getBinaryStatusLabel(
        hasCompletedComplianceEvent(complianceSummaryEvents, [
          "skills_competency",
          "skills competency",
        ])
      )
    );
    drawField(
      "Performance Evaluation",
      getBinaryStatusLabel(
        hasCompletedComplianceEvent(complianceSummaryEvents, [
          "performance_evaluation",
          "performance evaluation",
        ])
      )
    );
    drawField(
      "TB",
      getBinaryStatusLabel(hasCompletedComplianceEvent(complianceSummaryEvents, ["tb"]))
    );
    drawField(
      "OIG",
      getBinaryStatusLabel(hasCompletedComplianceEvent(complianceSummaryEvents, ["oig"]))
    );
    drawField("Training", getBinaryStatusLabel(trainingComplete));
    drawDivider();

    drawSectionTitle("Employee Information");
    drawField("Employee Name", employeeName || "—");
    drawField("Email", employee.email);
    drawField("Phone", employee.phone);
    drawField(
      "Address",
      [employee.address, employee.city, employee.state, employee.zip]
        .filter(Boolean)
        .join(", ")
    );
    drawField("Position", employee.position);
    drawField("Status", employee.status);
    drawField("Application Created", formatDate(employee.created_at));
    drawDivider();

    if (documentType === "full" || documentType === "contract") {
      drawSectionTitle("Onboarding Contract Summary");
      drawField(
        "Status",
        getBinaryStatusLabel(
          Boolean(
            onboardingContract &&
              (onboardingContract.completed ||
                onboardingContract.signed_at ||
                onboardingContract.electronic_signature)
          )
        )
      );

      if (!onboardingContract) {
        drawText("No onboarding contract record found.");
      } else {
        drawField("Selected Role", onboardingContract.selected_role);
        drawField("Role Title", onboardingContract.role_title);
        drawField("Completed", onboardingContract.completed);
        drawField("Signed At", formatDateTime(onboardingContract.signed_at));
        drawField("Handbook Acknowledged", onboardingContract.handbook_acknowledged);
        drawField(
          "Job Description Acknowledged",
          onboardingContract.job_description_acknowledged
        );
        drawField("Policies Acknowledged", onboardingContract.policies_acknowledged);
        drawField("Electronic Signature", onboardingContract.electronic_signature);
      }

      drawDivider();

      drawCurrentEmploymentContractOnly();
    }

    if (documentType === "full" || documentType === "tax") {
      drawSectionTitle("Current Tax Form");
      drawField(
        "Status",
        getBinaryStatusLabel(
          Boolean(
            employeeTaxForm?.form_type &&
              (employeeTaxForm.employee_signed_at ||
                employeeTaxForm.employee_signed_name ||
                employeeTaxForm.form_status)
          )
        )
      );

      if (!employeeTaxForm?.form_type) {
        drawText("No current tax form found.");
      } else {
        const normalizedTaxFormData = normalizeTaxFormData(
          employeeTaxForm.form_type,
          employeeTaxForm.form_data
        ) as Record<string, unknown>;

        drawField("Form", getTaxFormLabel(employeeTaxForm.form_type));
        drawField("Status", employeeTaxForm.form_status);
        drawField(
          "Classification",
          employeeTaxForm.employment_classification
            ? formatEmploymentClassificationLabel(employeeTaxForm.employment_classification)
            : "—"
        );
        drawField("Admin Sent By", employeeTaxForm.admin_sent_by);
        drawField("Admin Sent At", formatDateTime(employeeTaxForm.admin_sent_at));
        drawField("Employee Signed Name", employeeTaxForm.employee_signed_name);
        drawField("Employee Signed Date", formatDateTime(employeeTaxForm.employee_signed_at));
        drawField("Last Updated", formatDateTime(employeeTaxForm.updated_at));
        y -= 4;
        drawText("Form Data", { bold: true, size: 11 });

        Object.entries(normalizedTaxFormData).forEach(([key, value]) => {
          drawField(formatLabel(key), value, { indent: 12 });
        });
      }

      drawDivider();
    }

    if (documentType === "full") {
      drawPortalFormSection({
        title: "Employee Handbook Acknowledgment",
        intro: [
          "I acknowledge that I have reviewed or received access to the Saintly Home Health employee handbook and understand I am responsible for following agency standards, professionalism, and compliance expectations.",
        ],
        acknowledged: onboardingContract?.handbook_acknowledged === true,
        signerName:
          onboardingContract?.job_acceptance_full_name ||
          onboardingContract?.electronic_signature ||
          employeeName ||
          "—",
        signedAt: onboardingContract?.signed_at,
        completionAt: onboardingContract?.signed_at,
      });

      drawPortalFormSection({
        title: "Job Acceptance Statement",
        intro: [
          "I have read, understand and agree to the terms specified in this job description for the position I presently hold. A copy of this job description has been given to me.",
          "I further understand that this job description may be reviewed at any time and that I will be provided with a revised copy.",
        ],
        acknowledged: onboardingContract?.job_acceptance_acknowledged === true,
        signerName: onboardingContract?.job_acceptance_full_name,
        signedAt: onboardingContract?.job_acceptance_signed_at,
        completionAt: onboardingContract?.job_acceptance_signed_at,
        includeRoleBreakdown: true,
      });

      drawPortalFormSection({
        title: "Form I-9 — Section 1",
        intro: [
          "Employees must complete and sign Section 1 of Form I-9 and attest, under penalty of perjury, that the information they provided is true and correct.",
        ],
        acknowledged: onboardingContract?.i9_s1_employee_ack === true,
        signerName: onboardingContract?.i9_s1_employee_full_name,
        signedAt: onboardingContract?.i9_s1_signed_at,
        completionAt: onboardingContract?.i9_s1_signed_at,
      });

      drawPortalFormSection({
        title: "Conflict of Interest + Confidentiality",
        intro: [
          "I have read and am fully familiar with the Agency's policy statement regarding conflict of interest.",
          "I understand that patient privacy and Protected Health Information must be maintained at all times.",
        ],
        acknowledged: onboardingContract?.conflict_confidentiality_acknowledged === true,
        signerName: onboardingContract?.conflict_confidentiality_full_name,
        signedAt: onboardingContract?.conflict_confidentiality_signed_at,
        completionAt: onboardingContract?.conflict_confidentiality_signed_at,
        extraFields: [
          {
            label: "Disclosure / Outside Interest",
            value: onboardingContract?.conflict_confidentiality_disclosure,
          },
        ],
      });

      drawPortalFormSection({
        title: "Electronic Documentation Signature Agreement",
        intro: [
          "I understand that Agency staff may use electronic signatures on computer-generated documentation.",
          "My login authentication password and signature passcode serve as my legal signature for the computerized medical record and other agency documentation.",
        ],
        acknowledged:
          onboardingContract?.electronic_signature_agreement_acknowledged === true,
        signerName: onboardingContract?.electronic_signature_agreement_full_name,
        signedAt: onboardingContract?.electronic_signature_agreement_signed_at,
        completionAt: onboardingContract?.electronic_signature_agreement_signed_at,
      });

      drawPortalFormSection({
        title: "Hepatitis B Vaccine Declination",
        intro: [
          "I have been given the opportunity to be vaccinated with Hepatitis B vaccine at no charge to myself. However, I decline Hepatitis B vaccination at this time.",
        ],
        acknowledged: onboardingContract?.hep_b_declination_acknowledged === true,
        signerName: onboardingContract?.hep_b_declination_full_name,
        signedAt: onboardingContract?.hep_b_declination_signed_at,
        completionAt: onboardingContract?.hep_b_declination_signed_at,
      });

      drawPortalFormSection({
        title: "TB Risk Assessment",
        intro: [
          "This questionnaire documents TB history, symptoms, and baseline risk factors in accordance with Saintly Home Health onboarding requirements.",
        ],
        acknowledged: onboardingContract?.tb_acknowledged === true,
        signerName: onboardingContract?.tb_full_name,
        signedAt: onboardingContract?.tb_signed_at,
        completionAt: onboardingContract?.tb_signed_at,
      });
    }

    if (documentType === "full") {
      drawSectionTitle("Training Completion");
      drawField("Status", getBinaryStatusLabel(trainingComplete));

      if (trainingRows.length === 0) {
        drawText("No training completion records found.");
      } else {
        const passedCount = trainingRows.filter((row) => row.passed).length;
        drawField("Completed Modules", `${passedCount} of ${trainingRows.length}`);
        drawField(
          "Certificate Status",
          passedCount === trainingRows.length ? "Completed" : "Incomplete"
        );
        y -= 4;

        trainingRows.forEach((row, index) => {
          drawText(`${index + 1}. ${formatValue(row.module_title)}`, {
            bold: true,
            size: 11,
          });
          drawField("Passed", row.passed, { indent: 12 });
          drawField("Score", row.score === null ? "—" : `${row.score}%`, { indent: 12 });
          drawField("Completed At", formatDateTime(row.completed_at), { indent: 12 });
          y -= 4;
        });
      }

      drawDivider();
    }

    if (documentType === "full") {
      drawSectionTitle("Compliance Events");

      if (!complianceEvents || complianceEvents.length === 0) {
        drawText("No compliance events found.");
      } else {
        (complianceEvents as ComplianceEventRow[]).forEach((event, index) => {
          drawText(
            `${index + 1}. ${event.event_title || formatLabel(event.event_type || "compliance_event")}`,
            { bold: true, size: 11 }
          );
          drawField("Event Type", event.event_type, { indent: 12 });
          drawField("Status", event.status, { indent: 12 });
          drawField("Due Date", formatDate(event.due_date), { indent: 12 });
          drawField("Completed At", formatDateTime(event.completed_at), { indent: 12 });
          drawField("Created At", formatDateTime(event.created_at), { indent: 12 });
          y -= 4;
        });
      }
    }
    }

    pdfDoc.getPages().forEach((pdfPage) => {
      const pageWidth = pdfPage.getWidth();

      pdfPage.drawText("Saintly Home Health — Confidential Employee Record", {
        x: margin,
        y: 24,
        size: 9,
        font,
        color: rgb(0.35, 0.35, 0.4),
      });

      pdfPage.drawText(generatedAtLabel, {
        x: pageWidth - margin - font.widthOfTextAtSize(generatedAtLabel, 9),
        y: 24,
        size: 9,
        font,
        color: rgb(0.35, 0.35, 0.4),
      });
    });

    const pdfBytes = await pdfDoc.save();
    const fileName =
      documentType === "contract"
        ? `${safeEmployeeName}-contract.pdf`
        : documentType === "employment_contract"
          ? `${safeEmployeeName}-employment-contract.pdf`
          : documentType === "tax"
            ? `${safeEmployeeName}-tax-form.pdf`
            : documentType === "training"
              ? `${safeEmployeeName}-training-certificate.pdf`
              : documentType === "application"
                ? `${safeEmployeeName}-application.pdf`
                : documentType === "employee_handbook"
                  ? `${safeEmployeeName}-employee-handbook.pdf`
                  : documentType === "job_acceptance"
                    ? `${safeEmployeeName}-job-acceptance.pdf`
                    : documentType === "i9"
                      ? `${safeEmployeeName}-i9.pdf`
                      : documentType === "conflict_of_interest"
                        ? `${safeEmployeeName}-conflict-of-interest.pdf`
                        : documentType === "electronic_signature_agreement"
                          ? `${safeEmployeeName}-electronic-signature-agreement.pdf`
                          : documentType === "hepatitis_b_declination"
                            ? `${safeEmployeeName}-hepatitis-b-declination.pdf`
                            : documentType === "tb_risk_assessment"
                              ? `${safeEmployeeName}-tb-risk-assessment.pdf`
                              : `${safeEmployeeName}-employee-file.pdf`;

    if (saveSnapshot && documentType === "full") {
      const snapshotTimestamp = new Date();
      const snapshotKey = snapshotTimestamp.toISOString().replace(/[:.]/g, "-");
      const snapshotFileName = `${safeEmployeeName}-survey-packet-${snapshotKey}.pdf`;
      const snapshotPath = `survey-packets/${employeeId}/${snapshotFileName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("applicant-files")
        .upload(snapshotPath, Buffer.from(pdfBytes), {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const { data: insertedSnapshot, error: insertError } = await supabaseAdmin
        .from("applicant_files")
        .insert({
          applicant_id: employeeId,
          document_type: "survey_packet",
          display_name: `Survey Packet Snapshot ${formatDateTime(snapshotTimestamp.toISOString())}`,
          file_name: snapshotFileName,
          file_path: snapshotPath,
          storage_path: snapshotPath,
          file_type: "application/pdf",
          file_size: pdfBytes.length,
          required: false,
        })
        .select("id")
        .single();

      if (insertError) {
        await supabaseAdmin.storage.from("applicant-files").remove([snapshotPath]);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      if (insertedSnapshot?.id) {
        await insertAuditLog({
          action: "survey_packet_snapshot_save",
          entityType: "applicant_file",
          entityId: insertedSnapshot.id,
          metadata: {
            applicant_id: employeeId,
            file_path: snapshotPath,
            file_name: snapshotFileName,
          },
        });
      }
    }

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inlinePdf ? "inline" : "attachment"}; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate employee PDF",
      },
      { status: 500 }
    );
  }
}
