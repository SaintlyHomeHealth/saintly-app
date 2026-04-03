import Link from "next/link";
import type { ReactNode } from "react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { supabase } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getStaffProfile,
  isAdminOrHigher,
  isManagerOrHigher,
  isPhoneWorkspaceUser,
  isSuperAdmin,
} from "@/lib/staff-profile";
import {
  DashboardPushActionCard,
  DashboardPushLink,
} from "@/app/admin/dashboard-push-nav";
import { ProcessNoopBatchButton } from "@/app/admin/process-noop-batch-button";
import { applicantRolePrimaryForCompliance } from "@/lib/applicant-role-for-compliance";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { routePerfLog, routePerfStart } from "@/lib/perf/route-perf";

type ApplicantRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  position: string | null;
  primary_discipline?: string | null;
  type_of_position?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type ComplianceEvent = {
  id: string;
  applicant_id: string;
  event_type: string | null;
  event_title: string | null;
  due_date: string | null;
  status: string | null;
  completed_at: string | null;
};

type AdminForm = {
  id: string;
  employee_id: string;
  compliance_event_id: string | null;
  form_type: string | null;
  status: string | null;
  updated_at?: string | null;
};

type CredentialRecord = {
  id: string;
  employee_id: string;
  credential_type: string;
  expiration_date: string | null;
};

type EmployeeContractLite = {
  applicant_id: string;
  employment_classification: "employee" | "contractor" | null;
  contract_status?: "draft" | "sent" | "signed" | "void" | null;
  employee_signed_at?: string | null;
};

type OnboardingStatusLite = {
  applicant_id: string;
  application_completed?: boolean | null;
};

type OnboardingContractStatusLite = {
  applicant_id: string;
  completed?: boolean | null;
};

type EmployeeTaxFormLite = {
  applicant_id: string;
  form_status?: string | null;
  employee_signed_name?: string | null;
  employee_signed_at?: string | null;
};

type ApplicantFileLite = {
  id: string;
  applicant_id: string;
};

type DocumentLite = {
  id: string;
  applicant_id: string;
  document_type: string | null;
};

type TrainingCompletionLite = {
  id: string;
  applicant_id: string;
};

type TrainingProgressLite = {
  id: string;
  applicant_id: string;
  is_complete?: boolean | null;
};

const annualComplianceDefinitions = [
  { eventType: "skills_checklist", label: "Skills Competency" },
  { eventType: "annual_performance_evaluation", label: "Performance Evaluation" },
  { eventType: "annual_tb_statement", label: "Annual TB Statement" },
  { eventType: "annual_training", label: "Annual Training" },
  { eventType: "annual_contract_review", label: "Contract Annual Review" },
  { eventType: "annual_oig_check", label: "Annual OIG Exclusion Check" },
] as const;

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type CrmContactFields = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

function normalizeOne<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function crmContactLabel(raw: CrmContactFields | null | undefined): string {
  if (!raw) return "—";
  const fn = (raw.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

type PatientAssignmentLite = {
  assigned_user_id: string | null;
  role: string;
  is_active: boolean;
};

function hasActivePrimaryNurse(assignments: PatientAssignmentLite | PatientAssignmentLite[] | null | undefined): boolean {
  const list = Array.isArray(assignments)
    ? assignments
    : assignments
      ? [assignments]
      : [];
  return list.some(
    (a) => a.is_active && a.role === "primary_nurse" && Boolean(a.assigned_user_id)
  );
}

function getDaysUntil(dateString?: string | null) {
  if (!dateString) return null;

  const now = new Date();
  const due = new Date(dateString);

  if (Number.isNaN(due.getTime())) return null;

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((due.getTime() - now.getTime()) / msPerDay);
}

function getEmployeeName(applicant: ApplicantRow) {
  const full = `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim();
  return full || "Unnamed applicant";
}

function getRole(applicant: ApplicantRow) {
  return applicantRolePrimaryForCompliance(applicant) || "No role listed";
}

function getEmployeeStatusMeta(statusValue?: string | null) {
  const normalized = (statusValue || "").toLowerCase().trim();

  switch (normalized) {
    case "active":
      return {
        label: "Active",
        badgeClass: "border border-green-200 bg-green-50 text-green-700",
      };
    case "inactive":
      return {
        label: "Inactive",
        badgeClass: "border border-red-200 bg-red-50 text-red-700",
      };
    case "onboarding":
      return {
        label: "Onboarding",
        badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
      };
    default:
      return {
        label: "Applicant",
        badgeClass: "border border-sky-200 bg-sky-50 text-sky-700",
      };
    }
}

const NOTIFICATION_QUEUE_STATUS_FILTERS = new Set([
  "pending",
  "processing",
  "sent",
  "failed",
]);

function getDashboardHref({
  status,
  alertFilter,
  pipeline,
  nq,
}: {
  status?: string | null;
  alertFilter?: string | null;
  pipeline?: string | null;
  /** Notification queue table filter (preserved across employee filter links). */
  nq?: string | null;
}) {
  const params = new URLSearchParams();

  if (status && status !== "all") {
    params.set("status", status);
  }

  if (alertFilter) {
    params.set("alertFilter", alertFilter);
  }

  if (pipeline) {
    params.set("pipeline", pipeline);
  }

  if (nq && NOTIFICATION_QUEUE_STATUS_FILTERS.has(nq)) {
    params.set("nq", nq);
  }

  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

function normalizeCredentialTypeKey(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();

  if (t === "insurance") {
    return "independent_contractor_insurance";
  }

  return t;
}

function getRequiredCredentialTypes(
  roleValue?: string | null,
  employmentClassification?: "employee" | "contractor" | null
) {
  const normalizedRole = (roleValue || "").toLowerCase().trim();
  const requiredTypes: string[] = [];

  const isLicensedClinicalRole =
    normalizedRole === "rn" ||
    normalizedRole === "lpn" ||
    normalizedRole === "lvn" ||
    normalizedRole === "pt" ||
    normalizedRole === "pta" ||
    normalizedRole === "ot" ||
    normalizedRole === "ota" ||
    normalizedRole === "st" ||
    normalizedRole === "slp" ||
    normalizedRole === "msw" ||
    normalizedRole.includes("registered nurse") ||
    normalizedRole.includes("licensed practical nurse") ||
    normalizedRole.includes("licensed vocational nurse") ||
    normalizedRole.includes("physical therapist") ||
    normalizedRole.includes("physical therapy assistant") ||
    normalizedRole.includes("occupational therapist") ||
    normalizedRole.includes("occupational therapy assistant") ||
    normalizedRole.includes("speech therapist") ||
    normalizedRole.includes("speech language") ||
    normalizedRole.includes("medical social worker");

  if (isLicensedClinicalRole) {
    requiredTypes.push(
      "professional_license",
      "cpr",
      "tb_expiration",
      "drivers_license",
      "auto_insurance",
      "fingerprint_clearance_card"
    );
  }

  if (
    normalizedRole.includes("caregiver") ||
    normalizedRole.includes("hha") ||
    normalizedRole.includes("cna")
  ) {
    requiredTypes.push(
      "cpr",
      "tb_expiration",
      "drivers_license",
      "auto_insurance",
      "fingerprint_clearance_card"
    );
  }

  if (employmentClassification === "contractor") {
    requiredTypes.push("independent_contractor_insurance");
  }

  return Array.from(new Set(requiredTypes));
}

function getDaysRemaining(dateString?: string | null) {
  if (!dateString) return null;

  const today = new Date();
  const expiration = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00` : dateString
  );

  today.setHours(0, 0, 0, 0);
  expiration.setHours(0, 0, 0, 0);

  if (Number.isNaN(expiration.getTime())) return null;

  const diffMs = expiration.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getEventTypeLabel(eventType?: string | null) {
  const normalized = (eventType || "").toLowerCase().trim();

  switch (normalized) {
    case "skills_checklist":
      return "Skills Competency";
    case "annual_performance_evaluation":
      return "Performance Evaluation";
    case "annual_oig_check":
      return "OIG Check";
    case "annual_contract_review":
    case "contract_annual_review":
      return "Contract Review";
    case "annual_training":
      return "Annual Training";
    case "annual_tb_statement":
      return "Annual TB Statement";
    default:
      return "Compliance Event";
  }
}

function getStatusBadgeClasses(
  tone: "green" | "red" | "amber" | "sky" | "slate" | "violet"
) {
  switch (tone) {
    case "green":
      return "border border-green-200 bg-green-50 text-green-700";
    case "red":
      return "border border-red-200 bg-red-50 text-red-700";
    case "amber":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "sky":
      return "border border-sky-200 bg-sky-50 text-sky-700";
    case "violet":
      return "border border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getComplianceTone(
  event?: ComplianceEvent | null,
  form?: AdminForm | null
): "green" | "red" | "amber" | "sky" | "slate" {
  if (!event && !form) return "slate";
  if (form?.status === "finalized" || event?.status === "completed") return "green";
  if (form?.status === "draft") return "amber";

  const days = getDaysUntil(event?.due_date);
  if (typeof days === "number" && days < 0) return "red";
  if (typeof days === "number" && days <= 30) return "amber";
  return "sky";
}

function getComplianceLabel(event?: ComplianceEvent | null, form?: AdminForm | null) {
  if (!event && !form) return "No annual event";
  if (form?.status === "finalized" || event?.status === "completed") return "Completed";
  if (form?.status === "draft") return "Draft Saved";

  const days = getDaysUntil(event?.due_date);
  if (typeof days === "number" && days < 0) return "Overdue";
  if (typeof days === "number" && days <= 30) return "Due Soon";

  return "Scheduled";
}

/** Stage label when onboarding forms include at least one finalized record (same as Employees list Stage column). */
const DASHBOARD_STAGE_ACTIVE_EMPLOYEE = "Active Employee";

function getEmployeeStage(
  events: ComplianceEvent[],
  forms: AdminForm[]
): {
  label: string;
  tone: "green" | "red" | "amber" | "sky" | "slate" | "violet";
} {
  const hasEvents = events.length > 0;
  const hasForms = forms.length > 0;
  const hasFinalized = forms.some((f) => f.status === "finalized");
  const hasDraft = forms.some((f) => f.status === "draft");

  if (!hasEvents && !hasForms) {
    return { label: "New Applicant", tone: "sky" };
  }

  if (hasEvents && !hasForms) {
    return { label: "Hired - Not Started", tone: "violet" };
  }

  if (hasDraft && !hasFinalized) {
    return { label: "Onboarding In Progress", tone: "amber" };
  }

  if (hasFinalized) {
    return { label: DASHBOARD_STAGE_ACTIVE_EMPLOYEE, tone: "green" };
  }

  return { label: "Needs Review", tone: "slate" };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{
    alertFilter?: string;
    status?: string;
    pipeline?: string;
    nq?: string;
  }>;
}) {
  const staffProfile = await getStaffProfile();

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notificationQueueFilter =
    resolvedSearchParams?.nq === "pending" ||
    resolvedSearchParams?.nq === "processing" ||
    resolvedSearchParams?.nq === "sent" ||
    resolvedSearchParams?.nq === "failed"
      ? resolvedSearchParams.nq
      : null;
  const alertFilter =
    resolvedSearchParams?.alertFilter === "missing" ||
    resolvedSearchParams?.alertFilter === "expired" ||
    resolvedSearchParams?.alertFilter === "urgent" ||
    resolvedSearchParams?.alertFilter === "dueSoon" ||
    resolvedSearchParams?.alertFilter === "annualOverdue" ||
    resolvedSearchParams?.alertFilter === "annualUrgent" ||
    resolvedSearchParams?.alertFilter === "annualDueSoon" ||
    resolvedSearchParams?.alertFilter === "annualPending" ||
    resolvedSearchParams?.alertFilter === "annualMissing" ||
    resolvedSearchParams?.alertFilter === "surveyNotReady" ||
    resolvedSearchParams?.alertFilter === "activationBlocked" ||
    resolvedSearchParams?.alertFilter === "hireFileIncomplete" ||
    resolvedSearchParams?.alertFilter === "draft" ||
    resolvedSearchParams?.alertFilter === "due-soon" ||
    resolvedSearchParams?.alertFilter === "overdue" ||
    resolvedSearchParams?.alertFilter === "blocked"
      ? resolvedSearchParams.alertFilter
      : null;
  const statusFilter =
    resolvedSearchParams?.status === "active" ||
    resolvedSearchParams?.status === "inactive" ||
    resolvedSearchParams?.status === "onboarding"
      ? resolvedSearchParams.status
      : null;
  const pipelineFilter =
    resolvedSearchParams?.pipeline === "ready" ? resolvedSearchParams.pipeline : null;

  const { data: applicantsRaw, error: applicantsError } = await supabase
    .from("applicants")
    .select("*")
    .limit(50);

  if (applicantsError) {
    console.error("Applicants query error:", applicantsError);
  }

  const applicants = (applicantsRaw || []) as ApplicantRow[];
  const applicantIds = applicants.map((a) => a.id);

  let complianceEvents: ComplianceEvent[] = [];
  let annualComplianceEvents: ComplianceEvent[] = [];
  let adminForms: AdminForm[] = [];
  let employeeCredentials: CredentialRecord[] = [];
  let employeeContracts: EmployeeContractLite[] = [];
  let onboardingStatuses: OnboardingStatusLite[] = [];
  let onboardingContractStatuses: OnboardingContractStatusLite[] = [];
  let employeeTaxForms: EmployeeTaxFormLite[] = [];
  let applicantFiles: ApplicantFileLite[] = [];
  let documents: DocumentLite[] = [];
  let onboardingTrainingCompletions: TrainingCompletionLite[] = [];
  let trainingProgressRows: TrainingProgressLite[] = [];

  if (applicantIds.length > 0) {
    const batchPerf = routePerfStart();
    const supabaseAuthed = await createServerSupabaseClient();

    const [
      { data: eventsRaw },
      { data: formsRaw },
      { data: credentialsRaw },
      { data: contractsRaw },
      { data: onboardingStatusesRaw },
      { data: onboardingContractStatusesRaw },
      { data: employeeTaxFormsRaw },
      { data: applicantFilesRaw },
      { data: documentsRaw },
      { data: onboardingTrainingCompletionsRaw },
      { data: trainingProgressRaw },
      { data: annualEventsRaw },
    ] = await Promise.all([
      supabase
        .from("admin_compliance_events")
        .select("id, applicant_id, event_type, event_title, due_date, status, completed_at")
        .in("applicant_id", applicantIds)
        .in("event_type", ["skills_checklist", "annual_performance_evaluation"])
        .order("due_date", { ascending: true }),
      supabase
        .from("employee_admin_forms")
        .select("id, employee_id, compliance_event_id, form_type, status, updated_at")
        .in("employee_id", applicantIds)
        .in("form_type", ["skills_competency", "performance_evaluation"])
        .order("updated_at", { ascending: false }),
      supabaseAuthed
        .from("employee_credentials")
        .select("id, employee_id, credential_type, expiration_date")
        .in("employee_id", applicantIds)
        .order("expiration_date", { ascending: true }),
      supabase
        .from("employee_contracts")
        .select("applicant_id, employment_classification, contract_status, employee_signed_at")
        .in("applicant_id", applicantIds)
        .eq("is_current", true),
      supabase
        .from("onboarding_status")
        .select("applicant_id, application_completed")
        .in("applicant_id", applicantIds),
      supabase
        .from("onboarding_contracts")
        .select("applicant_id, completed")
        .in("applicant_id", applicantIds),
      supabase
        .from("employee_tax_forms")
        .select("applicant_id, form_status, employee_signed_name, employee_signed_at")
        .in("applicant_id", applicantIds)
        .eq("is_current", true),
      supabase
        .from("applicant_files")
        .select("id, applicant_id")
        .in("applicant_id", applicantIds),
      supabase
        .from("documents")
        .select("id, applicant_id, document_type")
        .in("applicant_id", applicantIds),
      supabase
        .from("onboarding_training_completions")
        .select("id, applicant_id")
        .in("applicant_id", applicantIds),
      supabase
        .from("applicant_training_progress")
        .select("id, applicant_id, is_complete")
        .in("applicant_id", applicantIds),
      supabase
        .from("admin_compliance_events")
        .select("id, applicant_id, event_type, event_title, due_date, status, completed_at")
        .in("applicant_id", applicantIds)
        .in(
          "event_type",
          annualComplianceDefinitions.map((item) => item.eventType)
        )
        .order("due_date", { ascending: true }),
    ]);

    complianceEvents = (eventsRaw || []) as ComplianceEvent[];
    adminForms = (formsRaw || []) as AdminForm[];
    employeeCredentials = (credentialsRaw || []) as CredentialRecord[];
    employeeContracts = (contractsRaw || []) as EmployeeContractLite[];
    onboardingStatuses = (onboardingStatusesRaw || []) as OnboardingStatusLite[];
    onboardingContractStatuses =
      (onboardingContractStatusesRaw || []) as OnboardingContractStatusLite[];
    employeeTaxForms = (employeeTaxFormsRaw || []) as EmployeeTaxFormLite[];
    applicantFiles = (applicantFilesRaw || []) as ApplicantFileLite[];
    documents = (documentsRaw || []) as DocumentLite[];
    onboardingTrainingCompletions =
      (onboardingTrainingCompletionsRaw || []) as TrainingCompletionLite[];
    trainingProgressRows = (trainingProgressRaw || []) as TrainingProgressLite[];
    annualComplianceEvents = (annualEventsRaw || []) as ComplianceEvent[];

    if (batchPerf) {
      routePerfLog("admin/dashboard/applicant-batch", batchPerf);
    }
  }

  const now = new Date();

  const overdueEvents = complianceEvents.filter((event) => {
    if (event.status === "completed") return false;
    if (!event.due_date) return false;
    const due = new Date(event.due_date);
    return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
  });

  const draftForms = adminForms.filter((form) => form.status === "draft");
  const draftFormEmployeeIds = new Set(draftForms.map((form) => form.employee_id));

  const credentialsByEmployee = new Map<string, CredentialRecord[]>();
  employeeCredentials.forEach((credential) => {
    const current = credentialsByEmployee.get(credential.employee_id) || [];
    current.push(credential);
    credentialsByEmployee.set(credential.employee_id, current);
  });

  const employmentClassificationByEmployee = new Map<string, "employee" | "contractor" | null>();
  employeeContracts.forEach((contract) => {
    employmentClassificationByEmployee.set(
      contract.applicant_id,
      contract.employment_classification
    );
  });

  const onboardingStatusByEmployee = new Map<string, OnboardingStatusLite>();
  onboardingStatuses.forEach((item) => {
    onboardingStatusByEmployee.set(item.applicant_id, item);
  });

  const onboardingContractStatusByEmployee = new Map<string, OnboardingContractStatusLite>();
  onboardingContractStatuses.forEach((item) => {
    onboardingContractStatusByEmployee.set(item.applicant_id, item);
  });

  const taxFormByEmployee = new Map<string, EmployeeTaxFormLite>();
  employeeTaxForms.forEach((item) => {
    taxFormByEmployee.set(item.applicant_id, item);
  });

  const contractByEmployee = new Map<string, EmployeeContractLite>();
  employeeContracts.forEach((item) => {
    contractByEmployee.set(item.applicant_id, item);
  });

  const applicantFilesByEmployee = new Map<string, ApplicantFileLite[]>();
  applicantFiles.forEach((item) => {
    const current = applicantFilesByEmployee.get(item.applicant_id) || [];
    current.push(item);
    applicantFilesByEmployee.set(item.applicant_id, current);
  });

  const documentsByEmployee = new Map<string, DocumentLite[]>();
  documents.forEach((item) => {
    const current = documentsByEmployee.get(item.applicant_id) || [];
    current.push(item);
    documentsByEmployee.set(item.applicant_id, current);
  });

  const onboardingTrainingCompletionsByEmployee = new Map<string, TrainingCompletionLite[]>();
  onboardingTrainingCompletions.forEach((item) => {
    const current = onboardingTrainingCompletionsByEmployee.get(item.applicant_id) || [];
    current.push(item);
    onboardingTrainingCompletionsByEmployee.set(item.applicant_id, current);
  });

  const trainingProgressByEmployee = new Map<string, TrainingProgressLite[]>();
  trainingProgressRows.forEach((item) => {
    const current = trainingProgressByEmployee.get(item.applicant_id) || [];
    current.push(item);
    trainingProgressByEmployee.set(item.applicant_id, current);
  });

  const missingCredentialDetails = applicants
    .map((applicant) => {
      const requiredCredentialTypes = getRequiredCredentialTypes(
        applicantRolePrimaryForCompliance(applicant),
        employmentClassificationByEmployee.get(applicant.id) || null
      );

      if (requiredCredentialTypes.length === 0) {
        return null;
      }

      const existingTypes = new Set(
        (credentialsByEmployee.get(applicant.id) || []).map((credential) =>
          normalizeCredentialTypeKey(credential.credential_type)
        )
      );

      const missingTypes = requiredCredentialTypes.filter(
        (credentialType) => !existingTypes.has(credentialType)
      );

      if (missingTypes.length === 0) {
        return null;
      }

      return {
        applicantId: applicant.id,
        employeeName: getEmployeeName(applicant),
        missingTypes,
      };
    })
    .filter(
      (
        item
      ): item is {
        applicantId: string;
        employeeName: string;
        missingTypes: string[];
      } => item !== null
    );

  const missingCredentialEmployeeIds = new Set(
    missingCredentialDetails.map((item) => item.applicantId)
  );

  const requiredCredentialReminderByEmployee = new Map(
    applicants.map((applicant) => {
      const requiredTypes = getRequiredCredentialTypes(
        applicantRolePrimaryForCompliance(applicant),
        employmentClassificationByEmployee.get(applicant.id) || null
      );

      return [
        applicant.id,
        requiredTypes.map((credentialType) =>
          getCredentialReminderStateForType(
            credentialType,
            credentialsByEmployee.get(applicant.id) || []
          )
        ),
      ] as const;
    })
  );

  const overdueCredentialEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        (requiredCredentialReminderByEmployee.get(applicant.id) || []).some(
          (status) => status.label === "Overdue"
        )
      )
      .map((applicant) => applicant.id)
  );
  const expiredCredentialEmployeeIds = overdueCredentialEmployeeIds;
  const urgentCredentialEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        (requiredCredentialReminderByEmployee.get(applicant.id) || []).some(
          (status) => status.label === "Urgent"
        )
      )
      .map((applicant) => applicant.id)
  );
  const dueSoonCredentialEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        (requiredCredentialReminderByEmployee.get(applicant.id) || []).some(
          (status) => status.label === "Due Soon"
        )
      )
      .map((applicant) => applicant.id)
  );

  const employeesWithOverdueAnnualEvents = applicants.filter((applicant) =>
    annualComplianceEvents.some((event) => {
      if (event.applicant_id !== applicant.id) return false;
      if (event.status === "completed") return false;
      const days = getDaysUntil(event.due_date);
      return typeof days === "number" && days < 0;
    })
  ).length;
  const annualOverdueEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        annualComplianceEvents.some((event) => {
          if (event.applicant_id !== applicant.id) return false;
          if (event.status === "completed") return false;
          const days = getDaysUntil(event.due_date);
          return typeof days === "number" && days < 0;
        })
      )
      .map((applicant) => applicant.id)
  );

  const annualUrgentEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        annualComplianceEvents.some((event) => {
          if (event.applicant_id !== applicant.id) return false;
          if (event.status === "completed") return false;
          const days = getDaysUntil(event.due_date);
          return typeof days === "number" && days >= 0 && days <= 7;
        })
      )
      .map((applicant) => applicant.id)
  );

  const annualDueSoonEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        annualComplianceEvents.some((event) => {
          if (event.applicant_id !== applicant.id) return false;
          if (event.status === "completed") return false;
          const days = getDaysUntil(event.due_date);
          return typeof days === "number" && days >= 8 && days <= 30;
        })
      )
      .map((applicant) => applicant.id)
  );

  const employeesMissingAnnualEvents = applicants.filter((applicant) =>
    annualComplianceDefinitions.some(
      (definition) =>
        !annualComplianceEvents.some(
          (event) =>
            event.applicant_id === applicant.id && event.event_type === definition.eventType
        )
    )
  ).length;
  const annualMissingEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        annualComplianceDefinitions.some(
          (definition) =>
            !annualComplianceEvents.some(
              (event) =>
                event.applicant_id === applicant.id &&
                event.event_type === definition.eventType
            )
        )
      )
      .map((applicant) => applicant.id)
  );

  const annualPendingEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        annualComplianceEvents.some((event) => {
          if (event.applicant_id !== applicant.id) return false;
          if (event.status === "completed") return false;
          const days = getDaysUntil(event.due_date);
          return typeof days !== "number" || days > 30;
        })
      )
      .map((applicant) => applicant.id)
  );

  const requiredOnboardingDocumentTypes = [
    "resume",
    "drivers_license",
    "fingerprint_clearance_card",
    "social_security_card",
    "cpr_front",
    "tb_test",
  ];

  const employeeReadinessById = new Map(
    applicants.map((applicant) => {
      const contract = contractByEmployee.get(applicant.id) || null;
      const taxForm = taxFormByEmployee.get(applicant.id) || null;
      const onboardingStatusRecord = onboardingStatusByEmployee.get(applicant.id) || null;
      const onboardingContractStatus =
        onboardingContractStatusByEmployee.get(applicant.id) || null;
      const uploadedDocumentTypes = new Set(
        (documentsByEmployee.get(applicant.id) || []).map((document) =>
          String(document.document_type || "").toLowerCase().trim()
        )
      );
      const isApplicationComplete = onboardingStatusRecord?.application_completed === true;
      const isDocumentsComplete =
        (applicantFilesByEmployee.get(applicant.id)?.length || 0) > 0 ||
        requiredOnboardingDocumentTypes.every((documentType) =>
          uploadedDocumentTypes.has(documentType)
        );
      const isTaxFormSigned = Boolean(
        taxForm &&
          (taxForm.form_status === "completed" ||
            ((taxForm.employee_signed_name || "").trim() && taxForm.employee_signed_at))
      );
      const isContractsComplete = Boolean(onboardingContractStatus?.completed && isTaxFormSigned);
      const isTrainingComplete = Boolean(
        (onboardingTrainingCompletionsByEmployee.get(applicant.id)?.length || 0) > 0 ||
          (trainingProgressByEmployee.get(applicant.id) || []).some((row) => row.is_complete)
      );
      const isContractSigned = Boolean(
        contract && (contract.contract_status === "signed" || contract.employee_signed_at)
      );
      const requiredCredentialTypes = getRequiredCredentialTypes(
        applicantRolePrimaryForCompliance(applicant),
        employmentClassificationByEmployee.get(applicant.id) || null
      );
      const requiredCredentialStates = requiredCredentialTypes.map((credentialType) =>
        getCredentialStateForType(credentialType, credentialsByEmployee.get(applicant.id) || [])
      );
      const hasExpiredRequiredCredentials = requiredCredentialStates.some(
        (status) => status.label === "Expired"
      );
      const missingRequiredCredentials = requiredCredentialStates.some(
        (status) => status.label === "Missing"
      );

      const employeeAnnualEvents = annualComplianceEvents.filter(
        (event) => event.applicant_id === applicant.id
      );
      const employeeForms = adminForms.filter((form) => form.employee_id === applicant.id);
      const currentSkillsEvent =
        employeeAnnualEvents
          .filter((event) => (event.event_type || "").toLowerCase().trim() === "skills_checklist")
          .sort((a, b) => {
            const aTime = a.due_date ? new Date(a.due_date).getTime() : 0;
            const bTime = b.due_date ? new Date(b.due_date).getTime() : 0;
            return bTime - aTime;
          })[0] || null;
      const currentPerformanceEvent =
        employeeAnnualEvents
          .filter(
            (event) =>
              (event.event_type || "").toLowerCase().trim() ===
              "annual_performance_evaluation"
          )
          .sort((a, b) => {
            const aTime = a.due_date ? new Date(a.due_date).getTime() : 0;
            const bTime = b.due_date ? new Date(b.due_date).getTime() : 0;
            return bTime - aTime;
          })[0] || null;
      const currentSkillsForm =
        employeeForms.find(
          (form) =>
            (form.form_type || "").toLowerCase().trim() === "skills_competency" &&
            form.compliance_event_id === currentSkillsEvent?.id
        ) || null;
      const currentPerformanceForm =
        employeeForms.find(
          (form) =>
            (form.form_type || "").toLowerCase().trim() === "performance_evaluation" &&
            form.compliance_event_id === currentPerformanceEvent?.id
        ) || null;
      const isSkillsComplete =
        currentSkillsForm?.status === "finalized" ||
        currentSkillsEvent?.status === "completed" ||
        !!currentSkillsEvent?.completed_at;
      const isPerformanceComplete =
        currentPerformanceForm?.status === "finalized" ||
        currentPerformanceEvent?.status === "completed" ||
        !!currentPerformanceEvent?.completed_at;
      const isTbComplete = employeeAnnualEvents.some(
        (event) =>
          (event.event_type || "").toLowerCase().trim() === "annual_tb_statement" &&
          (event.status === "completed" || !!event.completed_at)
      );
      const isOigComplete = employeeAnnualEvents.some(
        (event) =>
          (event.event_type || "").toLowerCase().trim() === "annual_oig_check" &&
          (event.status === "completed" || !!event.completed_at)
      );

      const requiresCpr = requiredCredentialTypes.includes("cpr");
      const requiresDriversLicense = requiredCredentialTypes.includes("drivers_license");
      const requiresFingerprintCard = requiredCredentialTypes.includes(
        "fingerprint_clearance_card"
      );
      const existingCredentialTypes = new Set(
        (credentialsByEmployee.get(applicant.id) || []).map((credential) =>
          normalizeCredentialTypeKey(credential.credential_type)
        )
      );
      const hasCprCard = !requiresCpr || existingCredentialTypes.has("cpr");
      const hasDriversLicense =
        !requiresDriversLicense || existingCredentialTypes.has("drivers_license");
      const hasFingerprintCard =
        !requiresFingerprintCard || existingCredentialTypes.has("fingerprint_clearance_card");

      const isSurveyReady =
        isApplicationComplete &&
        isDocumentsComplete &&
        isContractsComplete &&
        isTrainingComplete &&
        isSkillsComplete &&
        isPerformanceComplete &&
        isTbComplete &&
        isOigComplete &&
        isTaxFormSigned &&
        hasCprCard &&
        hasDriversLicense &&
        hasFingerprintCard;

      const activationBlocked =
        (String(applicant.status || "").toLowerCase().trim() === "onboarding" ||
          String(applicant.status || "").toLowerCase().trim() === "applicant") &&
        (!isApplicationComplete ||
          !isTaxFormSigned ||
          !isContractSigned ||
          missingRequiredCredentials ||
          hasExpiredRequiredCredentials ||
          !isSkillsComplete);

      const hasIncompleteHireFile =
        !isApplicationComplete ||
        !isDocumentsComplete ||
        !isContractsComplete ||
        !isTrainingComplete ||
        !isTaxFormSigned;

      return [
        applicant.id,
        {
          isSurveyReady,
          activationBlocked,
          hasIncompleteHireFile,
        },
      ] as const;
    })
  );

  const surveyNotReadyEmployeeIds = new Set(
    applicants
      .filter((applicant) => !employeeReadinessById.get(applicant.id)?.isSurveyReady)
      .map((applicant) => applicant.id)
  );
  const activationBlockedEmployeeIds = new Set(
    applicants
      .filter((applicant) => employeeReadinessById.get(applicant.id)?.activationBlocked)
      .map((applicant) => applicant.id)
  );
  const incompleteHireFileEmployeeIds = new Set(
    applicants
      .filter((applicant) => employeeReadinessById.get(applicant.id)?.hasIncompleteHireFile)
      .map((applicant) => applicant.id)
  );

  const activeEmployeesCount = applicants.filter(
    (a) => (a.status || "").toLowerCase().trim() === "active"
  ).length;

  const pipelineApplicantsCount = applicants.filter((a) => {
    const s = (a.status || "").toLowerCase().trim();
    return s === "onboarding" || s === "applicant" || s === "";
  }).length;

  const actionRequiredEmployeeIds = new Set<string>();
  missingCredentialEmployeeIds.forEach((id) => actionRequiredEmployeeIds.add(id));
  overdueCredentialEmployeeIds.forEach((id) => actionRequiredEmployeeIds.add(id));
  annualOverdueEmployeeIds.forEach((id) => actionRequiredEmployeeIds.add(id));
  activationBlockedEmployeeIds.forEach((id) => actionRequiredEmployeeIds.add(id));
  const actionRequiredCount = actionRequiredEmployeeIds.size;

  const dueSoonKpiEmployeeIds = new Set<string>();
  dueSoonCredentialEmployeeIds.forEach((id) => dueSoonKpiEmployeeIds.add(id));
  annualDueSoonEmployeeIds.forEach((id) => dueSoonKpiEmployeeIds.add(id));
  annualUrgentEmployeeIds.forEach((id) => dueSoonKpiEmployeeIds.add(id));
  const dueSoonKpiCount = dueSoonKpiEmployeeIds.size;

  const missingItemsEmployeeIds = new Set<string>();
  missingCredentialEmployeeIds.forEach((id) => missingItemsEmployeeIds.add(id));
  annualMissingEmployeeIds.forEach((id) => missingItemsEmployeeIds.add(id));
  const missingItemsCount = missingItemsEmployeeIds.size;

  const overdueCombinedEmployeeIds = new Set<string>();
  overdueCredentialEmployeeIds.forEach((id) => overdueCombinedEmployeeIds.add(id));
  annualOverdueEmployeeIds.forEach((id) => overdueCombinedEmployeeIds.add(id));
  const overdueCombinedCount = overdueCombinedEmployeeIds.size;

  const dueSoonActionCount = new Set([
    ...dueSoonCredentialEmployeeIds,
    ...annualDueSoonEmployeeIds,
    ...annualUrgentEmployeeIds,
  ]).size;

  const annualDueSoonSummaryIds = new Set<string>([
    ...annualUrgentEmployeeIds,
    ...annualDueSoonEmployeeIds,
  ]);
  const annualDueSoonSummaryCount = annualDueSoonSummaryIds.size;

  const employeeRows = applicants.slice(0, 25).map((applicant) => {
    const employeeEvents = complianceEvents.filter(
      (event) => event.applicant_id === applicant.id
    );

    const employeeForms = adminForms.filter((form) => form.employee_id === applicant.id);

    const currentSkillsEvent =
      employeeEvents
        .filter(
          (event) =>
            (event.event_type || "").toLowerCase().trim() === "skills_checklist"
        )
        .sort((a, b) => {
          const aTime = a.due_date ? new Date(a.due_date).getTime() : 0;
          const bTime = b.due_date ? new Date(b.due_date).getTime() : 0;
          return bTime - aTime;
        })[0] || null;

    const currentPerformanceEvent =
      employeeEvents
        .filter(
          (event) =>
            (event.event_type || "").toLowerCase().trim() ===
            "annual_performance_evaluation"
        )
        .sort((a, b) => {
          const aTime = a.due_date ? new Date(a.due_date).getTime() : 0;
          const bTime = b.due_date ? new Date(b.due_date).getTime() : 0;
          return bTime - aTime;
        })[0] || null;

    const currentSkillsForm =
      employeeForms.find(
        (form) =>
          (form.form_type || "").toLowerCase().trim() === "skills_competency" &&
          form.compliance_event_id === currentSkillsEvent?.id
      ) || null;

    const currentPerformanceForm =
      employeeForms.find(
        (form) =>
          (form.form_type || "").toLowerCase().trim() ===
            "performance_evaluation" &&
          form.compliance_event_id === currentPerformanceEvent?.id
      ) || null;

    const nextEvent =
      [currentSkillsEvent, currentPerformanceEvent]
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = a?.due_date
            ? new Date(a.due_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bTime = b?.due_date
            ? new Date(b.due_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })[0] || null;

    const nextEventForm =
      (nextEvent?.event_type || "").toLowerCase().trim() === "skills_checklist"
        ? currentSkillsForm
        : (nextEvent?.event_type || "").toLowerCase().trim() ===
          "annual_performance_evaluation"
        ? currentPerformanceForm
        : null;

    const complianceLabel = getComplianceLabel(nextEvent, nextEventForm);
    const complianceTone = getComplianceTone(nextEvent, nextEventForm);
    const stage = getEmployeeStage(employeeEvents, employeeForms);
    const normalizedStatus = (applicant.status || "").toLowerCase().trim();
    const isFullyCompliant =
      normalizedStatus === "active" &&
      !missingCredentialEmployeeIds.has(applicant.id) &&
      !expiredCredentialEmployeeIds.has(applicant.id) &&
      !annualOverdueEmployeeIds.has(applicant.id);

    return {
      applicant,
      nextEvent,
      complianceLabel,
      complianceTone,
      stage,
      isFullyCompliant,
    };
  });

  const filteredEmployeeRows = employeeRows.filter((row) => {
    if (statusFilter) {
      if (statusFilter === "active") {
        if (row.stage.label !== DASHBOARD_STAGE_ACTIVE_EMPLOYEE) {
          return false;
        }
      } else {
        const employeeStatus = (row.applicant.status || "").toLowerCase().trim();
        if (employeeStatus !== statusFilter) {
          return false;
        }
      }
    }

    if (pipelineFilter === "ready") {
      const employeeStatus = (row.applicant.status || "").toLowerCase().trim();
      const isReadyToActivate =
        employeeStatus === "onboarding" &&
        !missingCredentialEmployeeIds.has(row.applicant.id) &&
        !expiredCredentialEmployeeIds.has(row.applicant.id) &&
        !annualOverdueEmployeeIds.has(row.applicant.id);

      if (!isReadyToActivate) {
        return false;
      }
    }

    if (alertFilter === "missing") {
      return (
        missingCredentialEmployeeIds.has(row.applicant.id) ||
        annualMissingEmployeeIds.has(row.applicant.id)
      );
    }

    if (alertFilter === "due-soon") {
      return (
        dueSoonCredentialEmployeeIds.has(row.applicant.id) ||
        annualDueSoonEmployeeIds.has(row.applicant.id) ||
        annualUrgentEmployeeIds.has(row.applicant.id)
      );
    }

    if (alertFilter === "overdue") {
      return (
        overdueCredentialEmployeeIds.has(row.applicant.id) ||
        annualOverdueEmployeeIds.has(row.applicant.id)
      );
    }

    if (alertFilter === "blocked") {
      return activationBlockedEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "expired") {
      return overdueCredentialEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "urgent") {
      return urgentCredentialEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "dueSoon") {
      return dueSoonCredentialEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "annualOverdue") {
      return annualOverdueEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "annualUrgent") {
      return annualUrgentEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "annualDueSoon") {
      return annualDueSoonEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "annualPending") {
      return annualPendingEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "annualMissing") {
      return annualMissingEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "surveyNotReady") {
      return surveyNotReadyEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "activationBlocked") {
      return activationBlockedEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "hireFileIncomplete") {
      return incompleteHireFileEmployeeIds.has(row.applicant.id);
    }

    if (alertFilter === "draft") {
      return draftFormEmployeeIds.has(row.applicant.id);
    }

    return true;
  });

  const actionCenterMissingHref = getDashboardHref({
    status: statusFilter,
    alertFilter: "missing",
    pipeline: pipelineFilter,
    nq: notificationQueueFilter,
  });
  const actionCenterDueSoonHref = getDashboardHref({
    status: statusFilter,
    alertFilter: "due-soon",
    pipeline: pipelineFilter,
    nq: notificationQueueFilter,
  });
  const actionCenterOverdueHref = getDashboardHref({
    status: statusFilter,
    alertFilter: "overdue",
    pipeline: pipelineFilter,
    nq: notificationQueueFilter,
  });
  const actionCenterBlockedHref = getDashboardHref({
    status: statusFilter,
    alertFilter: "blocked",
    pipeline: pipelineFilter,
    nq: notificationQueueFilter,
  });

  const viewAllAnnualEventsTargetId =
    annualComplianceEvents[0]?.applicant_id ??
    employeeRows[0]?.applicant.id ??
    null;
  const viewAllAnnualEventsHref = viewAllAnnualEventsTargetId
    ? `/admin/employees/${viewAllAnnualEventsTargetId}#event-management`
    : "/admin";

  const complianceIssueEmployeeIds = new Set<string>();
  missingCredentialEmployeeIds.forEach((id) => complianceIssueEmployeeIds.add(id));
  overdueCredentialEmployeeIds.forEach((id) => complianceIssueEmployeeIds.add(id));
  annualOverdueEmployeeIds.forEach((id) => complianceIssueEmployeeIds.add(id));
  annualMissingEmployeeIds.forEach((id) => complianceIssueEmployeeIds.add(id));
  overdueEvents.forEach((event) => complianceIssueEmployeeIds.add(event.applicant_id));
  const complianceFocusEmployeeId =
    applicants.find((applicant) => complianceIssueEmployeeIds.has(applicant.id))?.id ?? null;
  const complianceFocusHref = complianceFocusEmployeeId
    ? `/admin/employees/${complianceFocusEmployeeId}`
    : "/admin";

  let staffAccessLabel = "";
  if (staffProfile) {
    if (isSuperAdmin(staffProfile)) {
      staffAccessLabel = "Super admin — full access";
    } else if (isAdminOrHigher(staffProfile)) {
      staffAccessLabel = "Admin access";
    } else if (isManagerOrHigher(staffProfile)) {
      staffAccessLabel = "Manager access";
    } else if (staffProfile.role === "nurse") {
      staffAccessLabel = "Nurse";
    }
  }

  type AuditLogViewRow = {
    id: string;
    created_at: string;
    actor_email: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
  };

  type NotificationOutboxViewRow = {
    id: string;
    created_at: string;
    updated_at: string;
    source: string;
    dedupe_key: string;
    status: string;
    recipient_kind: string;
  };

  let recentAuditRows: AuditLogViewRow[] = [];
  let recentNotificationOutboxRows: NotificationOutboxViewRow[] = [];
  let notificationQueueCounts = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
  };
  let notificationQueueLastTerminalAt: string | null = null;

  if (isAdminOrHigher(staffProfile)) {
    const supabaseStaffRead = await createServerSupabaseClient();

    let outboxListQuery = supabaseStaffRead
      .from("notification_outbox")
      .select("id, created_at, updated_at, source, dedupe_key, status, recipient_kind")
      .order("created_at", { ascending: false })
      .limit(30);
    if (notificationQueueFilter) {
      outboxListQuery = outboxListQuery.eq("status", notificationQueueFilter);
    }

    const [
      auditResult,
      outboxResult,
      pendingCountRes,
      processingCountRes,
      sentCountRes,
      failedCountRes,
      lastTerminalRes,
    ] = await Promise.all([
      supabaseStaffRead
        .from("audit_log")
        .select("id, created_at, actor_email, action, entity_type, entity_id")
        .order("created_at", { ascending: false })
        .limit(30),
      outboxListQuery,
      supabaseStaffRead
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseStaffRead
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing"),
      supabaseStaffRead
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent"),
      supabaseStaffRead
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabaseStaffRead
        .from("notification_outbox")
        .select("updated_at")
        .in("status", ["sent", "failed"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    recentAuditRows = (auditResult.data || []) as AuditLogViewRow[];
    recentNotificationOutboxRows = (outboxResult.data || []) as NotificationOutboxViewRow[];
    notificationQueueCounts = {
      pending: pendingCountRes.count ?? 0,
      processing: processingCountRes.count ?? 0,
      sent: sentCountRes.count ?? 0,
      failed: failedCountRes.count ?? 0,
    };
    const terminalAt = lastTerminalRes.data?.updated_at;
    notificationQueueLastTerminalAt =
      typeof terminalAt === "string" && terminalAt.length > 0 ? terminalAt : null;
  }

  let ccMissedFollowUps = 0;
  let ccOpenPhoneTasks = 0;
  let ccLeadsOpen = 0;
  let ccLeadsFollowUpToday = 0;
  let ccActivePatients = 0;
  let ccPrimaryAssigned = 0;
  let ccUnassignedPrimary = 0;
  let ccRecentMissedCalls: { id: string; from_e164: string | null; created_at: string }[] = [];
  const ccRecentLeads: { id: string; status: string | null; created_at: string; label: string }[] = [];
  const ccRecentPatients: { id: string; patient_status: string; created_at: string; label: string }[] = [];
  const ccNeedsAssignment: { id: string; patient_status: string; label: string }[] = [];

  if (isManagerOrHigher(staffProfile)) {
    const supabaseCc = await createServerSupabaseClient();
    const canPhoneCc = isAdminOrHigher(staffProfile);
    const crmTodayIso = getCrmCalendarTodayIso();

    const [
      leadsOpenRes,
      leadsFollowUpTodayRes,
      activePatientsRes,
      primaryAssignRes,
      recentLeadsRes,
      recentPatientsRes,
      activePoolRes,
    ] = await Promise.all([
      supabaseCc
        .from("leads")
        .select("id", { count: "exact", head: true })
        .or("status.is.null,and(status.neq.converted,status.neq.dead_lead)"),
      supabaseCc
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("follow_up_date", crmTodayIso),
      supabaseCc
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("patient_status", "active"),
      supabaseCc
        .from("patient_assignments")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("role", "primary_nurse"),
      supabaseCc
        .from("leads")
        .select("id, status, created_at, contacts ( full_name, first_name, last_name )")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseCc
        .from("patients")
        .select("id, patient_status, created_at, contacts ( full_name, first_name, last_name )")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseCc
        .from("patients")
        .select(
          "id, patient_status, contacts ( full_name, first_name, last_name ), patient_assignments ( assigned_user_id, role, is_active )"
        )
        .eq("patient_status", "active")
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    ccLeadsOpen = leadsOpenRes.count ?? 0;
    ccLeadsFollowUpToday = leadsFollowUpTodayRes.count ?? 0;
    ccActivePatients = activePatientsRes.count ?? 0;
    ccPrimaryAssigned = primaryAssignRes.count ?? 0;
    ccUnassignedPrimary = Math.max(0, ccActivePatients - ccPrimaryAssigned);

    for (const row of (recentLeadsRes.data ?? []) as {
      id: string;
      status: string | null;
      created_at: string;
      contacts: CrmContactFields | CrmContactFields[] | null;
    }[]) {
      ccRecentLeads.push({
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        label: crmContactLabel(normalizeOne(row.contacts)),
      });
    }

    for (const row of (recentPatientsRes.data ?? []) as {
      id: string;
      patient_status: string;
      created_at: string;
      contacts: CrmContactFields | CrmContactFields[] | null;
    }[]) {
      ccRecentPatients.push({
        id: row.id,
        patient_status: row.patient_status,
        created_at: row.created_at,
        label: crmContactLabel(normalizeOne(row.contacts)),
      });
    }

    for (const row of (activePoolRes.data ?? []) as {
      id: string;
      patient_status: string;
      contacts: CrmContactFields | CrmContactFields[] | null;
      patient_assignments: PatientAssignmentLite | PatientAssignmentLite[] | null;
    }[]) {
      if (hasActivePrimaryNurse(row.patient_assignments)) continue;
      ccNeedsAssignment.push({
        id: row.id,
        patient_status: row.patient_status,
        label: crmContactLabel(normalizeOne(row.contacts)),
      });
      if (ccNeedsAssignment.length >= 5) break;
    }

    if (canPhoneCc) {
      const [mfRes, tasksRes, missedRes] = await Promise.all([
        supabaseCc
          .from("phone_call_notifications")
          .select("*", { count: "exact", head: true })
          .eq("status", "new"),
        supabaseCc
          .from("phone_call_tasks")
          .select("*", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]),
        supabaseCc
          .from("phone_calls")
          .select("id, from_e164, created_at")
          .eq("status", "missed")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
      ccMissedFollowUps = mfRes.count ?? 0;
      ccOpenPhoneTasks = tasksRes.count ?? 0;
      ccRecentMissedCalls = ((missedRes.data ?? []) as { id: string; from_e164: string | null; created_at: string }[]).map(
        (r) => ({
          id: r.id,
          from_e164: r.from_e164,
          created_at: r.created_at,
        })
      );
    }
  }

  const showCommandCenter = isManagerOrHigher(staffProfile);
  const canPhoneCommandCenter = isPhoneWorkspaceUser(staffProfile);
  const phoneDashboardHref = staffProfile?.role === "nurse" ? "/workspace/phone/today" : "/admin/phone";
  const crmPatientsHref =
    staffProfile?.role === "nurse" ? "/workspace/phone/patients" : "/admin/crm/patients";

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Saintly Super Dashboard"
        title="Saintly Command Center"
        metaLine={staffAccessLabel ?? undefined}
        description="Run your entire home health operation from one place — manage patients, inbound calls, referrals, compliance, staff, and dispatch without switching systems."
        actions={
          <>
            <SignOutButton
              label="Log out"
              className="w-full rounded-full border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:w-auto"
            />
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/admin/crm/patients"
                className="inline-flex min-h-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm"
              >
                + New Patient
              </Link>
              <Link
                href="/admin/crm/leads"
                className="inline-flex min-h-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm"
              >
                + New Lead
              </Link>
              {canPhoneCommandCenter ? (
                <Link
                  href="/workspace/phone/keypad"
                  className="inline-flex min-h-0 items-center justify-center rounded-[20px] border border-slate-200/90 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-slate-50 hover:shadow-md sm:text-sm"
                >
                  Open Workspace Keypad
                </Link>
              ) : (
                <div className="inline-flex min-h-0 items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-center text-xs font-semibold text-slate-500 sm:text-sm">
                  Workspace Keypad (phone access required)
                </div>
              )}
            </div>
            {canPhoneCommandCenter ? (
              <p className="max-w-md text-right text-[11px] leading-snug text-slate-500 sm:ml-auto">
                Use <span className="font-semibold text-slate-700">Call Log</span> in the top bar for the full call list
                {staffProfile?.role === "nurse" ? " (opens your phone workspace)" : " (/admin/phone)"}.
              </p>
            ) : null}
          </>
        }
        footer={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Needs Attention" value={String(actionRequiredCount)} tone="red" size="compact" />
            <StatCard label="Due Soon" value={String(dueSoonKpiCount)} tone="amber" size="compact" />
            <Link
              href="/admin/employees"
              className="block h-full min-h-0 rounded-[18px] outline-none ring-offset-2 transition hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <StatCard
                label="Employees"
                value={String(activeEmployeesCount)}
                tone="green"
                size="compact"
                className="h-full"
              />
            </Link>
            <StatCard label="Applicants" value={String(pipelineApplicantsCount)} tone="sky" size="compact" />
          </div>
        }
      />

      {showCommandCenter ? (
        <div className="overflow-hidden rounded-[32px] border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/50 shadow-sm">
          <div className="border-b border-indigo-100/80 bg-white/60 px-6 py-5 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Saintly Command Center</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Contacts, call log &amp; roster</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Jump to the call log, Contacts directory, follow-ups, and nurse roster from one place. Use the top bar for
              every major admin area.
            </p>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
            {canPhoneCommandCenter ? (
              <Link
                href={phoneDashboardHref}
                className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Voice</span>
                <span className="mt-2 text-base font-semibold text-slate-900">Call log</span>
                <span className="mt-1 text-xs leading-snug text-slate-600">Inbound calls &amp; alerts</span>
              </Link>
            ) : (
              <div className="flex flex-col rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Voice</span>
                <span className="mt-2 text-base font-semibold text-slate-700">Call log</span>
                <span className="mt-1 text-xs text-slate-500">Admin access required</span>
              </div>
            )}
            <Link
              href="/admin/crm/contacts"
              className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Directory</span>
              <span className="mt-2 text-base font-semibold text-slate-900">Contacts</span>
              <span className="mt-1 text-xs leading-snug text-slate-600">Directory &amp; profiles</span>
            </Link>
            <Link
              href="/admin/crm/leads"
              className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pipeline</span>
              <span className="mt-2 text-base font-semibold text-slate-900">Leads</span>
              <span className="mt-1 text-xs leading-snug text-slate-600">New inquiries</span>
            </Link>
            <Link
              href={crmPatientsHref}
              className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Care</span>
              <span className="mt-2 text-base font-semibold text-slate-900">Patients</span>
              <span className="mt-1 text-xs leading-snug text-slate-600">Active charts &amp; assignment</span>
            </Link>
            <Link
              href="/admin/crm/roster"
              className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Team</span>
              <span className="mt-2 text-base font-semibold text-slate-900">Roster</span>
              <span className="mt-1 text-xs leading-snug text-slate-600">Nurse assignments</span>
            </Link>
            <Link
              href="/admin/credentialing"
              className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Payers</span>
              <span className="mt-2 text-base font-semibold text-slate-900">Credentialing</span>
              <span className="mt-1 text-xs leading-snug text-slate-600">Onboarding &amp; contracting</span>
            </Link>
            {canPhoneCommandCenter ? (
              <Link
                href="/admin/staff"
                className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Accounts</span>
                <span className="mt-2 text-base font-semibold text-slate-900">Staff Access</span>
                <span className="mt-1 text-xs leading-snug text-slate-600">Logins, roles &amp; phone</span>
              </Link>
            ) : null}
            {canPhoneCommandCenter ? (
              <Link
                href="/admin/phone/tasks"
                className="flex flex-col rounded-[22px] border border-slate-200/90 bg-white/90 p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tasks</span>
                <span className="mt-2 text-base font-semibold text-slate-900">Phone tasks</span>
                <span className="mt-1 text-xs leading-snug text-slate-600">Open follow-ups</span>
              </Link>
            ) : (
              <div className="flex flex-col rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tasks</span>
                <span className="mt-2 text-base font-semibold text-slate-700">Phone tasks</span>
                <span className="mt-1 text-xs text-slate-500">Admin access required</span>
              </div>
            )}
          </div>

          <div className="grid gap-3 border-t border-indigo-100/60 bg-white/40 px-6 py-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <StatCard
              label={canPhoneCommandCenter ? "Follow-ups (new)" : "Follow-ups"}
              value={canPhoneCommandCenter ? String(ccMissedFollowUps) : "—"}
              tone="amber"
            />
            <StatCard
              label={canPhoneCommandCenter ? "Open phone tasks" : "Phone tasks"}
              value={canPhoneCommandCenter ? String(ccOpenPhoneTasks) : "—"}
              tone="sky"
            />
            <Link href="/admin/crm/leads?followUp=today" className="block min-w-0">
              <StatCard label="Lead follow-ups today" value={String(ccLeadsFollowUpToday)} tone="amber" />
            </Link>
            <StatCard label="Open leads" value={String(ccLeadsOpen)} tone="sky" />
            <StatCard label="Active patients" value={String(ccActivePatients)} tone="green" />
            <StatCard label="With primary nurse" value={String(ccPrimaryAssigned)} tone="green" />
            <StatCard label="Unassigned (active)" value={String(ccUnassignedPrimary)} tone="red" />
          </div>

          <div className="grid gap-6 border-t border-indigo-100/60 bg-white/30 p-6 lg:grid-cols-2">
            {canPhoneCommandCenter ? (
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Recent missed calls</h3>
                  <Link href="/admin/phone?status=missed" className="text-xs font-semibold text-indigo-700 hover:underline">
                    View all
                  </Link>
                </div>
                {ccRecentMissedCalls.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No recent missed calls.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {ccRecentMissedCalls.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                        <Link href={`/admin/phone/${c.id}`} className="font-mono text-xs text-indigo-800 hover:underline">
                          {c.from_e164 ?? "—"}
                        </Link>
                        <span className="text-xs text-slate-500">
                          {new Date(c.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/80 p-5">
                <h3 className="text-sm font-semibold text-slate-800">Phone activity</h3>
                <p className="mt-2 text-sm text-slate-600">Admin access is required to view phone queues and missed calls.</p>
              </div>
            )}

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Recent leads</h3>
                <Link href="/admin/crm/leads" className="text-xs font-semibold text-indigo-700 hover:underline">
                  Open leads
                </Link>
              </div>
              {ccRecentLeads.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No leads yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {ccRecentLeads.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="text-xs text-slate-500">{r.status ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Recent patients</h3>
                <Link href="/admin/crm/patients" className="text-xs font-semibold text-indigo-700 hover:underline">
                  All patients
                </Link>
              </div>
              {ccRecentPatients.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No patients yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {ccRecentPatients.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="text-xs text-slate-500">{r.patient_status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Needs primary nurse</h3>
                <Link href="/admin/crm/patients" className="text-xs font-semibold text-indigo-700 hover:underline">
                  Assign
                </Link>
              </div>
              {ccNeedsAssignment.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No active patients missing a primary nurse in the recent queue.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100">
                  {ccNeedsAssignment.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      <span className="text-xs text-slate-500">{r.patient_status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showCommandCenter ? (
        <div className="flex items-center gap-4 py-1">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-200/90 to-transparent" />
          <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
            Workforce &amp; Compliance
          </p>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-indigo-200/90 to-transparent" />
        </div>
      ) : null}

      <WorkforceSectionShell
        eyebrow={showCommandCenter ? undefined : "Workforce & Compliance"}
        title="Do This Now"
        description={<p>The three fastest paths for day-to-day admin work.</p>}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <DashboardPushActionCard
            title="Review Applicants"
            description="Open the onboarding queue and move new hires forward."
            href="/admin/onboarding"
            label="Open applicant pipeline"
          />
          <DashboardPushActionCard
            title="Fix Compliance Issues"
            description="Jump to an employee record with overdue or missing compliance items."
            href={complianceFocusHref}
            label="Open compliance focus"
          />
          <DashboardPushActionCard
            title="Finish Draft Forms"
            description="Resume saved Skills and Performance drafts waiting for completion."
            href={getDashboardHref({
              alertFilter: "draft",
              nq: notificationQueueFilter,
            })}
            label="Open draft queue"
          />
        </div>
      </WorkforceSectionShell>

      <WorkforceSectionShell
        title="Action Center"
        description={
          <p>
            Credential and annual gaps that need follow-up. Counts are unique employees where possible.
          </p>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardPushLink
            href={actionCenterMissingHref}
            className={`block w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
              alertFilter === "missing" || alertFilter === "annualMissing"
                ? "border-red-300 bg-red-100"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p className="text-sm font-semibold text-red-800">Missing Items</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{missingItemsCount}</p>
            <p className="mt-1 text-xs text-red-700">
              Missing credentials or annual event coverage (unique employees).
            </p>
          </DashboardPushLink>

          <DashboardPushLink
            href={actionCenterDueSoonHref}
            className={`block w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
              alertFilter === "due-soon" ||
              alertFilter === "dueSoon" ||
              alertFilter === "annualUrgent" ||
              alertFilter === "annualDueSoon"
                ? "border-amber-300 bg-amber-100"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-sm font-semibold text-amber-800">Due Soon</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{dueSoonActionCount}</p>
            <p className="mt-1 text-xs text-amber-700">
              Credentials or annual items due within the next 30 days (unique employees).
            </p>
          </DashboardPushLink>

          <DashboardPushLink
            href={actionCenterOverdueHref}
            className={`block w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
              alertFilter === "overdue" ||
              alertFilter === "expired" ||
              alertFilter === "annualOverdue"
                ? "border-red-300 bg-red-100"
                : "border-red-200 bg-red-50"
            }`}
          >
            <p className="text-sm font-semibold text-red-800">Overdue</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{overdueCombinedCount}</p>
            <p className="mt-1 text-xs text-red-700">
              Overdue credentials or annual events (unique employees).
            </p>
          </DashboardPushLink>

          <DashboardPushLink
            href={actionCenterBlockedHref}
            className={`block w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
              alertFilter === "blocked" || alertFilter === "activationBlocked"
                ? "border-amber-300 bg-amber-100"
                : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className="text-sm font-semibold text-amber-800">Blocked Employees</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {activationBlockedEmployeeIds.size}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Onboarding staff blocked from activation by readiness rules.
            </p>
          </DashboardPushLink>
        </div>
      </WorkforceSectionShell>

      <WorkforceSectionShell
        title="Annual Compliance"
        description={
          <p>
            Summary of recurring annual requirements (skills, performance, TB, training, and related checks).
          </p>
        }
        headerRight={
          <DashboardPushLink
            href={viewAllAnnualEventsHref}
            className="inline-flex w-full shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50 md:w-auto"
          >
            View All Annual Events
          </DashboardPushLink>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryPill label="Missing" value={employeesMissingAnnualEvents} tone="red" />
          <SummaryPill label="Due Soon" value={annualDueSoonSummaryCount} tone="amber" />
          <SummaryPill label="Overdue" value={employeesWithOverdueAnnualEvents} tone="red" />
          <SummaryPill label="Pending" value={annualPendingEmployeeIds.size} tone="amber" />
        </div>
      </WorkforceSectionShell>

      <WorkforceSectionShell
        title="Employees"
        description={
          <>
            <p>Open any employee record, check annual status, and take action fast.</p>
            <p className="mt-2 text-xs text-slate-500">
              Narrow the list by status, pipeline, or alerts. All clears status, pipeline, and alert filters.
            </p>
          </>
        }
        headerRight={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Top 25 most recent records
            </div>
            {statusFilter ? (
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Status: {statusFilter}
              </div>
            ) : null}
            {pipelineFilter ? (
              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Pipeline: Ready to Activate
              </div>
            ) : null}
            {alertFilter ? (
              <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                Filtered: {alertFilter === "missing"
                  ? "Missing Items"
                  : alertFilter === "dueSoon"
                  ? "Due Soon Credentials"
                  : alertFilter === "due-soon"
                    ? "Due Soon"
                    : alertFilter === "urgent"
                      ? "Urgent Credentials"
                      : alertFilter === "overdue"
                    ? "Overdue"
                    : alertFilter === "annualOverdue"
                    ? "Annual Overdue"
                    : alertFilter === "annualUrgent"
                      ? "Annual Urgent"
                    : alertFilter === "annualDueSoon"
                      ? "Annual Due Soon"
                    : alertFilter === "annualPending"
                      ? "Annual Pending"
                      : alertFilter === "annualMissing"
                        ? "Annual Missing"
                        : alertFilter === "surveyNotReady"
                          ? "Not Survey Ready"
                          : alertFilter === "blocked"
                            ? "Blocked"
                            : alertFilter === "activationBlocked"
                            ? "Activation Blocked"
                            : alertFilter === "hireFileIncomplete"
                              ? "Incomplete Hire Files"
                              : alertFilter === "draft"
                                ? "Draft forms"
                                : `${alertFilter} Credentials`}
              </div>
            ) : null}
          </div>
        }
      >
        <div className="mb-6 rounded-[20px] border border-indigo-100/70 bg-white/80 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">Employee filters</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {alertFilter ? (
              <Link
                href={getDashboardHref({
                  status: statusFilter,
                  alertFilter: null,
                  pipeline: pipelineFilter,
                  nq: notificationQueueFilter,
                })}
                className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Clear alert filter
              </Link>
            ) : null}
            <Link
              href={getDashboardHref({
                status: null,
                alertFilter: null,
                pipeline: null,
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                !statusFilter && !alertFilter && !pipelineFilter
                  ? "border border-slate-300 bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              All
            </Link>
            <Link
              href={getDashboardHref({
                status: "active",
                alertFilter,
                pipeline: pipelineFilter,
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "active"
                  ? "border border-green-200 bg-green-100 text-green-800"
                  : "border border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
              }`}
            >
              Active
            </Link>
            <Link
              href={getDashboardHref({
                status: "onboarding",
                alertFilter,
                pipeline: pipelineFilter,
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "onboarding"
                  ? "border border-amber-200 bg-amber-100 text-amber-800"
                  : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
            >
              Onboarding
            </Link>
            <Link
              href={getDashboardHref({
                status: "inactive",
                alertFilter,
                pipeline: pipelineFilter,
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === "inactive"
                  ? "border border-red-200 bg-red-100 text-red-800"
                  : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              Inactive
            </Link>
            <Link
              href={getDashboardHref({
                status: statusFilter,
                alertFilter,
                pipeline: "ready",
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                pipelineFilter === "ready"
                  ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              Ready to Activate
            </Link>
            <Link
              href={getDashboardHref({
                status: statusFilter,
                alertFilter: "surveyNotReady",
                pipeline: pipelineFilter,
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                alertFilter === "surveyNotReady"
                  ? "border border-rose-200 bg-rose-100 text-rose-800"
                  : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              Survey gaps ({surveyNotReadyEmployeeIds.size})
            </Link>
            <Link
              href={getDashboardHref({
                status: statusFilter,
                alertFilter: "hireFileIncomplete",
                pipeline: pipelineFilter,
                nq: notificationQueueFilter,
              })}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                alertFilter === "hireFileIncomplete"
                  ? "border border-indigo-200 bg-indigo-100 text-indigo-800"
                  : "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              Hire file ({incompleteHireFileEmployeeIds.size})
            </Link>
          </div>
        </div>

        {filteredEmployeeRows.length === 0 ? (
          <div className="py-2 text-sm text-slate-500">No employees match the current filters.</div>
        ) : (
          <div className="divide-y divide-indigo-100/60 rounded-[24px] border border-slate-200/90 bg-white/80">
            {filteredEmployeeRows.map((row) => (
              <div
                key={row.applicant.id}
                className="grid gap-4 px-4 py-5 sm:px-5 xl:grid-cols-[1.2fr_0.95fr_1fr_1fr_1fr_1.1fr_1.2fr] xl:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {getEmployeeName(row.applicant)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{row.applicant.email || "No email"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getEmployeeStatusMeta(
                        row.applicant.status
                      ).badgeClass}`}
                    >
                      {getEmployeeStatusMeta(row.applicant.status).label}
                    </span>
                    {row.isFullyCompliant ? (
                      <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                        Fully Compliant
                      </span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                    Stage
                  </p>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(
                      row.stage.tone
                    )}`}
                  >
                    {row.stage.label}
                  </span>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                    Role
                  </p>
                  <p className="text-sm text-slate-700">{getRole(row.applicant)}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                    Next Requirement
                  </p>
                  <p className="text-sm text-slate-700">
                    {row.nextEvent ? getEventTypeLabel(row.nextEvent.event_type) : "No annual event"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                    Due Date
                  </p>
                  <p className="text-sm text-slate-700">
                    {formatDate(row.nextEvent?.due_date)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 xl:hidden">
                    Status
                  </p>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClasses(
                      row.complianceTone
                    )}`}
                  >
                    {row.complianceLabel}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Link
                    href={`/admin/employees/${row.applicant.id}`}
                    className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    Open Employee
                  </Link>

                  <Link
                    href={`/admin/employees/${row.applicant.id}#event-management`}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    Manage Events
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkforceSectionShell>

      {isAdminOrHigher(staffProfile) ? (
        <>
          <WorkforceSectionShell
            title="Recent Audit Activity"
            description={
              <p className="text-xs text-slate-600">
                Latest sensitive actions. Visible to admins and super admins only (most recent 30).
              </p>
            }
          >
            {recentAuditRows.length === 0 ? (
              <p className="text-sm text-slate-500">No audit entries yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-[20px] border border-slate-200/90 bg-white">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-indigo-100/80 bg-slate-50/90 text-slate-600">
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Time</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Actor</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Action</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Entity</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Entity ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAuditRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                          {new Date(row.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="max-w-[160px] truncate px-4 py-2 text-slate-700">
                          {row.actor_email || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-800">
                          {row.action}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                          {row.entity_type}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-2 font-mono text-[11px] text-slate-600">
                          {row.entity_id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkforceSectionShell>

          <WorkforceSectionShell
            title="Notification Queue"
            description={
              <p className="text-xs text-slate-600">
                Queued intents (read-only). Admins and super admins only (table: up to 30 rows).{" "}
                <Link
                  href="/admin/phone"
                  className="font-semibold text-indigo-700 underline-offset-2 hover:underline"
                >
                  Phone calls
                </Link>
              </p>
            }
            headerRight={<ProcessNoopBatchButton />}
          >
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Totals:</span>{" "}
              {notificationQueueCounts.pending} pending · {notificationQueueCounts.processing} processing ·{" "}
              {notificationQueueCounts.sent} sent · {notificationQueueCounts.failed} failed
              {notificationQueueLastTerminalAt ? (
                <>
                  {" "}
                  · Last sent/failed update{" "}
                  {new Date(notificationQueueLastTerminalAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={getDashboardHref({
                  status: statusFilter,
                  alertFilter,
                  pipeline: pipelineFilter,
                  nq: null,
                })}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                  !notificationQueueFilter
                    ? "border border-slate-300 bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                All rows
              </Link>
              <Link
                href={getDashboardHref({
                  status: statusFilter,
                  alertFilter,
                  pipeline: pipelineFilter,
                  nq: "pending",
                })}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                  notificationQueueFilter === "pending"
                    ? "border border-amber-200 bg-amber-100 text-amber-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Pending ({notificationQueueCounts.pending})
              </Link>
              <Link
                href={getDashboardHref({
                  status: statusFilter,
                  alertFilter,
                  pipeline: pipelineFilter,
                  nq: "processing",
                })}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                  notificationQueueFilter === "processing"
                    ? "border border-sky-200 bg-sky-100 text-sky-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Processing ({notificationQueueCounts.processing})
              </Link>
              <Link
                href={getDashboardHref({
                  status: statusFilter,
                  alertFilter,
                  pipeline: pipelineFilter,
                  nq: "sent",
                })}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                  notificationQueueFilter === "sent"
                    ? "border border-emerald-200 bg-emerald-100 text-emerald-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Sent ({notificationQueueCounts.sent})
              </Link>
              <Link
                href={getDashboardHref({
                  status: statusFilter,
                  alertFilter,
                  pipeline: pipelineFilter,
                  nq: "failed",
                })}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                  notificationQueueFilter === "failed"
                    ? "border border-red-200 bg-red-100 text-red-900"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Failed ({notificationQueueCounts.failed})
              </Link>
            </div>

            {recentNotificationOutboxRows.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                {notificationQueueFilter
                  ? `No ${notificationQueueFilter} rows in the latest fetch (up to 30 by created date).`
                  : "No notification intents yet."}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-[20px] border border-slate-200/90 bg-white">
                <table className="w-full min-w-[880px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-indigo-100/80 bg-slate-50/90 text-slate-600">
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Created</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Updated</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Source</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Dedupe key</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Status</th>
                      <th className="whitespace-nowrap px-4 py-2 font-semibold">Recipient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentNotificationOutboxRows.map((row) => {
                      const isFailed = row.status === "failed";
                      return (
                        <tr
                          key={row.id}
                          className={`border-b border-slate-100 last:border-0 ${
                            isFailed ? "bg-red-50/90" : ""
                          }`}
                        >
                          <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                            {new Date(row.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                            {new Date(row.updated_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-800">
                            {row.source}
                          </td>
                          <td className="max-w-[240px] truncate px-4 py-2 font-mono text-[11px] text-slate-600">
                            {row.dedupe_key}
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-2 ${
                              isFailed ? "font-semibold text-red-800" : "text-slate-600"
                            }`}
                          >
                            {row.status}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                            {row.recipient_kind}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </WorkforceSectionShell>
        </>
      ) : null}
    </div>
  );
}

function WorkforceSectionShell({
  eyebrow,
  title,
  description,
  headerRight,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[32px] border border-indigo-100/90 bg-gradient-to-br from-indigo-50/45 via-white to-sky-50/30 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-indigo-100/70 bg-white/55 px-6 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-8">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">{eyebrow}</p>
          ) : null}
          <h2
            className={`text-2xl font-bold tracking-tight text-slate-900 ${eyebrow ? "mt-2" : ""}`}
          >
            {title}
          </h2>
          {description ? (
            <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</div>
          ) : null}
        </div>
        {headerRight ? <div className="shrink-0 pt-1 sm:pt-0">{headerRight}</div> : null}
      </div>
      <div className="bg-white/40 p-6 sm:p-8">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "slate",
  size = "default",
  className,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber" | "sky" | "slate";
  size?: "default" | "compact";
  className?: string;
}) {
  const toneMap = {
    green: "from-green-50 to-white border-green-100 text-green-700",
    red: "from-red-50 to-white border-red-100 text-red-700",
    amber: "from-amber-50 to-white border-amber-100 text-amber-700",
    sky: "from-sky-50 to-white border-sky-100 text-sky-700",
    slate: "from-slate-50 to-white border-slate-100 text-slate-700",
  };

  const compact = size === "compact";

  return (
    <div
      className={`border bg-gradient-to-br ${compact ? "rounded-[18px] p-3" : "rounded-[24px] p-4"} ${toneMap[tone]} ${className ?? ""}`}
    >
      <p
        className={`font-semibold uppercase tracking-[0.16em] ${compact ? "text-[10px] leading-tight" : "text-xs"}`}
      >
        {label}
      </p>
      <p className={`font-bold text-slate-900 ${compact ? "mt-1.5 text-2xl leading-none" : "mt-3 text-3xl"}`}>
        {value}
      </p>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "amber";
}) {
  const toneMap = {
    green: "border-green-200 bg-green-50 text-green-700",
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-[22px] border px-4 py-3 shadow-sm ${toneMap[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function getCredentialStateForType(
  credentialType: string,
  credentials: CredentialRecord[]
) {
  const matches = credentials.filter(
    (credential) =>
      normalizeCredentialTypeKey(credential.credential_type) === credentialType
  );

  if (matches.length === 0) {
    return { label: "Missing" as const };
  }

  const credential =
    matches
      .slice()
      .sort((a, b) => (b.expiration_date || "").localeCompare(a.expiration_date || ""))[0] ||
    null;

  const daysRemaining = getDaysRemaining(credential?.expiration_date);

  if (daysRemaining === null) {
    return { label: "Missing" as const };
  }

  if (daysRemaining < 0) {
    return { label: "Expired" as const };
  }

  if (daysRemaining <= 30) {
    return { label: "Due Soon" as const };
  }

  return { label: "Active" as const };
}

function getCredentialReminderStateForType(
  credentialType: string,
  credentials: CredentialRecord[]
) {
  const matches = credentials.filter(
    (credential) =>
      normalizeCredentialTypeKey(credential.credential_type) === credentialType
  );

  if (matches.length === 0) {
    return { label: "Missing" as const };
  }

  const credential =
    matches
      .slice()
      .sort((a, b) => (b.expiration_date || "").localeCompare(a.expiration_date || ""))[0] ||
    null;

  const daysRemaining = getDaysRemaining(credential?.expiration_date);

  if (daysRemaining === null) {
    return { label: "Missing" as const };
  }

  if (daysRemaining < 0) {
    return { label: "Overdue" as const };
  }

  if (daysRemaining <= 7) {
    return { label: "Urgent" as const };
  }

  if (daysRemaining <= 30) {
    return { label: "Due Soon" as const };
  }

  return { label: "Active" as const };
}

