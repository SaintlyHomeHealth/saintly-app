import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

/**
 * Employee directory: same source-of-truth as `/admin` dashboard and `/admin/employees/[id]`.
 * Primary entity: `public.applicants` (all pipeline + active/inactive employees).
 * Enrichment: compliance events, admin forms, credentials, contracts, onboarding_* tables
 * (mirrors `src/app/admin/page.tsx` data joins).
 *
 * Why the old `/admin/employees` list was empty: it used `createClient` with the **anon** key on the
 * server, so RLS typically returned zero rows. This loader uses **service role** after staff auth.
 */

export type EmployeeDirectorySegment =
  | "all"
  | "active"
  | "inactive"
  | "in_process"
  | "applicant_onboarding"
  | "ready_to_activate"
  | "compliance_gaps";

export type ApplicantRecord = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  position_applied: string | null;
  discipline: string | null;
  status: string | null;
  created_at: string | null;
  [key: string]: unknown;
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

type ApplicantFileLite = { id: string; applicant_id: string };
type DocumentLite = { id: string; applicant_id: string; document_type: string | null };
type TrainingCompletionLite = { id: string; applicant_id: string };
type TrainingProgressLite = { id: string; applicant_id: string; is_complete?: boolean | null };

const annualComplianceDefinitions = [
  { eventType: "skills_checklist", label: "Skills Competency" },
  { eventType: "annual_performance_evaluation", label: "Performance Evaluation" },
  { eventType: "annual_tb_statement", label: "Annual TB Statement" },
  { eventType: "annual_training", label: "Annual Training" },
  { eventType: "annual_contract_review", label: "Contract Annual Review" },
  { eventType: "annual_oig_check", label: "Annual OIG Exclusion Check" },
] as const;

const DASHBOARD_STAGE_ACTIVE_EMPLOYEE = "Active Employee";

function normalizeCredentialTypeKey(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();
  if (t === "insurance") return "independent_contractor_insurance";
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

function getDaysUntil(dateString?: string | null) {
  if (!dateString) return null;
  const now = new Date();
  const due = new Date(dateString);
  if (Number.isNaN(due.getTime())) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((due.getTime() - now.getTime()) / msPerDay);
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
  return Math.ceil((expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getCredentialStateForType(credentialType: string, credentials: CredentialRecord[]) {
  const matches = credentials.filter(
    (credential) => normalizeCredentialTypeKey(credential.credential_type) === credentialType
  );
  if (matches.length === 0) return { label: "Missing" as const };
  const credential = matches
    .slice()
    .sort((a, b) => (b.expiration_date || "").localeCompare(a.expiration_date || ""))[0];
  const daysRemaining = getDaysRemaining(credential?.expiration_date);
  if (daysRemaining === null) return { label: "Missing" as const };
  if (daysRemaining < 0) return { label: "Expired" as const };
  if (daysRemaining <= 30) return { label: "Due Soon" as const };
  return { label: "Active" as const };
}

function getCredentialReminderStateForType(credentialType: string, credentials: CredentialRecord[]) {
  const matches = credentials.filter(
    (credential) => normalizeCredentialTypeKey(credential.credential_type) === credentialType
  );
  if (matches.length === 0) return { label: "Missing" as const };
  const credential = matches
    .slice()
    .sort((a, b) => (b.expiration_date || "").localeCompare(a.expiration_date || ""))[0];
  const daysRemaining = getDaysRemaining(credential?.expiration_date);
  if (daysRemaining === null) return { label: "Missing" as const };
  if (daysRemaining < 0) return { label: "Overdue" as const };
  if (daysRemaining <= 7) return { label: "Urgent" as const };
  if (daysRemaining <= 30) return { label: "Due Soon" as const };
  return { label: "Active" as const };
}

function getEmployeeStage(
  events: ComplianceEvent[],
  forms: AdminForm[]
): { label: string; tone: "green" | "red" | "amber" | "sky" | "slate" | "violet" } {
  const hasEvents = events.length > 0;
  const hasForms = forms.length > 0;
  const hasFinalized = forms.some((f) => f.status === "finalized");
  const hasDraft = forms.some((f) => f.status === "draft");

  if (!hasEvents && !hasForms) return { label: "New Applicant", tone: "sky" };
  if (hasEvents && !hasForms) return { label: "Hired - Not Started", tone: "violet" };
  if (hasDraft && !hasFinalized) return { label: "Onboarding In Progress", tone: "amber" };
  if (hasFinalized) return { label: DASHBOARD_STAGE_ACTIVE_EMPLOYEE, tone: "green" };
  return { label: "Needs Review", tone: "slate" };
}

function employeeName(a: ApplicantRecord): string {
  const full = `${a.first_name || ""} ${a.last_name || ""}`.trim();
  return full || "Unnamed";
}

function roleDisplay(a: ApplicantRecord): string {
  return (
    (a.position as string) ||
    (a.position_applied as string) ||
    (a.discipline as string) ||
    "—"
  );
}

export type EmployeeDirectoryRow = {
  applicant: ApplicantRecord;
  nameDisplay: string;
  roleDisplay: string;
  normalizedStatus: string;
  /** Employment / pipeline status (system column `applicants.status`) — not the onboarding stage pill. */
  employmentStatusLabel: string;
  employmentStatusBadgeClass: string;
  /** Stable key for sorting by status */
  employmentStatusSortKey: string;
  stageLabel: string;
  stageTone: ReturnType<typeof getEmployeeStage>["tone"];
  e164: string | null;
  readyToActivate: boolean;
  inApplicantOnboardingBucket: boolean;
  inProcessBucket: boolean;
  hasComplianceSurveyGaps: boolean;
  complianceTone: "green" | "amber" | "red";
  complianceLabel: string;
  lastUpdatedMs: number;
};

/** Maps `applicants.status` to ops-friendly labels (never conflates with onboarding *stage*). */
function employmentStatusPresentation(ns: string): {
  label: string;
  badgeClass: string;
  sortKey: string;
} {
  switch (ns) {
    case "active":
      return {
        label: "Active",
        badgeClass: "border border-green-200 bg-green-50 text-green-800",
        sortKey: "active",
      };
    case "inactive":
      return {
        label: "Inactive",
        badgeClass: "border border-red-200 bg-red-50 text-red-800",
        sortKey: "inactive",
      };
    case "onboarding":
      return {
        label: "In process",
        badgeClass: "border border-amber-200 bg-amber-50 text-amber-900",
        sortKey: "in_process",
      };
    case "applicant":
    default:
      return {
        label: "Applicant",
        badgeClass: "border border-sky-200 bg-sky-50 text-sky-900",
        sortKey: "applicant",
      };
  }
}

export async function loadEmployeeDirectoryRows(): Promise<{
  rows: EmployeeDirectoryRow[];
  loadError: string | null;
}> {
  const { data: applicantsRaw, error: applicantsError } = await supabaseAdmin
    .from("applicants")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1500);

  if (applicantsError) {
    return {
      rows: [],
      loadError: applicantsError.message,
    };
  }

  const applicants = (applicantsRaw || []) as ApplicantRecord[];
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
    const [
      eventsRes,
      annualRes,
      formsRes,
      credRes,
      contractsRes,
      obRes,
      obContractRes,
      taxRes,
      filesRes,
      docsRes,
      trainDoneRes,
      trainProgRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("admin_compliance_events")
        .select("id, applicant_id, event_type, event_title, due_date, status, completed_at")
        .in("applicant_id", applicantIds)
        .in("event_type", ["skills_checklist", "annual_performance_evaluation"])
        .order("due_date", { ascending: true }),
      supabaseAdmin
        .from("admin_compliance_events")
        .select("id, applicant_id, event_type, event_title, due_date, status, completed_at")
        .in("applicant_id", applicantIds)
        .in(
          "event_type",
          annualComplianceDefinitions.map((d) => d.eventType)
        )
        .order("due_date", { ascending: true }),
      supabaseAdmin
        .from("employee_admin_forms")
        .select("id, employee_id, compliance_event_id, form_type, status, updated_at")
        .in("employee_id", applicantIds)
        .in("form_type", ["skills_competency", "performance_evaluation"])
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("employee_credentials")
        .select("id, employee_id, credential_type, expiration_date")
        .in("employee_id", applicantIds)
        .order("expiration_date", { ascending: true }),
      supabaseAdmin
        .from("employee_contracts")
        .select("applicant_id, employment_classification, contract_status, employee_signed_at")
        .in("applicant_id", applicantIds)
        .eq("is_current", true),
      supabaseAdmin
        .from("onboarding_status")
        .select("applicant_id, application_completed")
        .in("applicant_id", applicantIds),
      supabaseAdmin
        .from("onboarding_contracts")
        .select("applicant_id, completed")
        .in("applicant_id", applicantIds),
      supabaseAdmin
        .from("employee_tax_forms")
        .select("applicant_id, form_status, employee_signed_name, employee_signed_at")
        .in("applicant_id", applicantIds)
        .eq("is_current", true),
      supabaseAdmin.from("applicant_files").select("id, applicant_id").in("applicant_id", applicantIds),
      supabaseAdmin
        .from("documents")
        .select("id, applicant_id, document_type")
        .in("applicant_id", applicantIds),
      supabaseAdmin
        .from("onboarding_training_completions")
        .select("id, applicant_id")
        .in("applicant_id", applicantIds),
      supabaseAdmin
        .from("applicant_training_progress")
        .select("id, applicant_id, is_complete")
        .in("applicant_id", applicantIds),
    ]);

    complianceEvents = (eventsRes.data || []) as ComplianceEvent[];
    annualComplianceEvents = (annualRes.data || []) as ComplianceEvent[];
    adminForms = (formsRes.data || []) as AdminForm[];
    employeeCredentials = (credRes.data || []) as CredentialRecord[];
    employeeContracts = (contractsRes.data || []) as EmployeeContractLite[];
    onboardingStatuses = (obRes.data || []) as OnboardingStatusLite[];
    onboardingContractStatuses = (obContractRes.data || []) as OnboardingContractStatusLite[];
    employeeTaxForms = (taxRes.data || []) as EmployeeTaxFormLite[];
    applicantFiles = (filesRes.data || []) as ApplicantFileLite[];
    documents = (docsRes.data || []) as DocumentLite[];
    onboardingTrainingCompletions = (trainDoneRes.data || []) as TrainingCompletionLite[];
    trainingProgressRows = (trainProgRes.data || []) as TrainingProgressLite[];
  }

  const credentialsByEmployee = new Map<string, CredentialRecord[]>();
  employeeCredentials.forEach((c) => {
    const cur = credentialsByEmployee.get(c.employee_id) || [];
    cur.push(c);
    credentialsByEmployee.set(c.employee_id, cur);
  });

  const employmentClassificationByEmployee = new Map<string, "employee" | "contractor" | null>();
  employeeContracts.forEach((c) => {
    employmentClassificationByEmployee.set(c.applicant_id, c.employment_classification);
  });

  const onboardingStatusByEmployee = new Map<string, OnboardingStatusLite>();
  onboardingStatuses.forEach((r) => onboardingStatusByEmployee.set(r.applicant_id, r));

  const onboardingContractStatusByEmployee = new Map<string, OnboardingContractStatusLite>();
  onboardingContractStatuses.forEach((r) =>
    onboardingContractStatusByEmployee.set(r.applicant_id, r)
  );

  const taxFormByEmployee = new Map<string, EmployeeTaxFormLite>();
  employeeTaxForms.forEach((r) => taxFormByEmployee.set(r.applicant_id, r));

  const contractByEmployee = new Map<string, EmployeeContractLite>();
  employeeContracts.forEach((c) => contractByEmployee.set(c.applicant_id, c));

  const applicantFilesByEmployee = new Map<string, ApplicantFileLite[]>();
  applicantFiles.forEach((f) => {
    const cur = applicantFilesByEmployee.get(f.applicant_id) || [];
    cur.push(f);
    applicantFilesByEmployee.set(f.applicant_id, cur);
  });

  const documentsByEmployee = new Map<string, DocumentLite[]>();
  documents.forEach((d) => {
    const cur = documentsByEmployee.get(d.applicant_id) || [];
    cur.push(d);
    documentsByEmployee.set(d.applicant_id, cur);
  });

  const onboardingTrainingCompletionsByEmployee = new Map<string, TrainingCompletionLite[]>();
  onboardingTrainingCompletions.forEach((t) => {
    const cur = onboardingTrainingCompletionsByEmployee.get(t.applicant_id) || [];
    cur.push(t);
    onboardingTrainingCompletionsByEmployee.set(t.applicant_id, cur);
  });

  const trainingProgressByEmployee = new Map<string, TrainingProgressLite[]>();
  trainingProgressRows.forEach((t) => {
    const cur = trainingProgressByEmployee.get(t.applicant_id) || [];
    cur.push(t);
    trainingProgressByEmployee.set(t.applicant_id, cur);
  });

  const missingCredentialEmployeeIds = new Set<string>();
  applicants.forEach((applicant) => {
    const required = getRequiredCredentialTypes(
      applicant.position || applicant.position_applied || "",
      employmentClassificationByEmployee.get(applicant.id) || null
    );
    if (required.length === 0) return;
    const existing = new Set(
      (credentialsByEmployee.get(applicant.id) || []).map((x) =>
        normalizeCredentialTypeKey(x.credential_type)
      )
    );
    if (required.some((t) => !existing.has(t))) missingCredentialEmployeeIds.add(applicant.id);
  });

  const requiredCredentialReminderByEmployee = new Map(
    applicants.map((applicant) => {
      const requiredTypes = getRequiredCredentialTypes(
        applicant.position || applicant.position_applied || "",
        employmentClassificationByEmployee.get(applicant.id) || null
      );
      return [
        applicant.id,
        requiredTypes.map((t) =>
          getCredentialReminderStateForType(t, credentialsByEmployee.get(applicant.id) || [])
        ),
      ] as const;
    })
  );

  const overdueCredentialEmployeeIds = new Set(
    applicants
      .filter((a) =>
        (requiredCredentialReminderByEmployee.get(a.id) || []).some((s) => s.label === "Overdue")
      )
      .map((a) => a.id)
  );

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
      .map((a) => a.id)
  );

  const annualMissingEmployeeIds = new Set(
    applicants
      .filter((applicant) =>
        annualComplianceDefinitions.some(
          (def) =>
            !annualComplianceEvents.some(
              (e) => e.applicant_id === applicant.id && e.event_type === def.eventType
            )
        )
      )
      .map((a) => a.id)
  );

  const requiredOnboardingDocumentTypes = [
    "resume",
    "drivers_license",
    "fingerprint_clearance_card",
    "social_security_card",
    "cpr_front",
    "tb_test",
  ];

  const employeeReadinessById = new Map<
    string,
    { isSurveyReady: boolean; activationBlocked: boolean; hasIncompleteHireFile: boolean }
  >();

  applicants.forEach((applicant) => {
    const contract = contractByEmployee.get(applicant.id) || null;
    const taxForm = taxFormByEmployee.get(applicant.id) || null;
    const onboardingStatusRecord = onboardingStatusByEmployee.get(applicant.id) || null;
    const onboardingContractStatus =
      onboardingContractStatusByEmployee.get(applicant.id) || null;
    const uploadedDocumentTypes = new Set(
      (documentsByEmployee.get(applicant.id) || []).map((d) =>
        String(d.document_type || "").toLowerCase().trim()
      )
    );
    const isApplicationComplete = onboardingStatusRecord?.application_completed === true;
    const isDocumentsComplete =
      (applicantFilesByEmployee.get(applicant.id)?.length || 0) > 0 ||
      requiredOnboardingDocumentTypes.every((dt) => uploadedDocumentTypes.has(dt));
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
      applicant.position || applicant.position_applied || "",
      employmentClassificationByEmployee.get(applicant.id) || null
    );
    const requiredCredentialStates = requiredCredentialTypes.map((ct) =>
      getCredentialStateForType(ct, credentialsByEmployee.get(applicant.id) || [])
    );
    const hasExpiredRequiredCredentials = requiredCredentialStates.some(
      (s) => s.label === "Expired"
    );
    const missingRequiredCredentials = requiredCredentialStates.some((s) => s.label === "Missing");

    const employeeAnnualEvents = annualComplianceEvents.filter((e) => e.applicant_id === applicant.id);
    const employeeForms = adminForms.filter((f) => f.employee_id === applicant.id);
    const currentSkillsEvent =
      employeeAnnualEvents
        .filter((e) => (e.event_type || "").toLowerCase().trim() === "skills_checklist")
        .sort((a, b) => {
          const aT = a.due_date ? new Date(a.due_date).getTime() : 0;
          const bT = b.due_date ? new Date(b.due_date).getTime() : 0;
          return bT - aT;
        })[0] || null;
    const currentPerformanceEvent =
      employeeAnnualEvents
        .filter(
          (e) =>
            (e.event_type || "").toLowerCase().trim() === "annual_performance_evaluation"
        )
        .sort((a, b) => {
          const aT = a.due_date ? new Date(a.due_date).getTime() : 0;
          const bT = b.due_date ? new Date(b.due_date).getTime() : 0;
          return bT - aT;
        })[0] || null;
    const currentSkillsForm =
      employeeForms.find(
        (f) =>
          (f.form_type || "").toLowerCase().trim() === "skills_competency" &&
          f.compliance_event_id === currentSkillsEvent?.id
      ) || null;
    const currentPerformanceForm =
      employeeForms.find(
        (f) =>
          (f.form_type || "").toLowerCase().trim() === "performance_evaluation" &&
          f.compliance_event_id === currentPerformanceEvent?.id
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
      (e) =>
        (e.event_type || "").toLowerCase().trim() === "annual_tb_statement" &&
        (e.status === "completed" || !!e.completed_at)
    );
    const isOigComplete = employeeAnnualEvents.some(
      (e) =>
        (e.event_type || "").toLowerCase().trim() === "annual_oig_check" &&
        (e.status === "completed" || !!e.completed_at)
    );

    const requiresCpr = requiredCredentialTypes.includes("cpr");
    const requiresDriversLicense = requiredCredentialTypes.includes("drivers_license");
    const requiresFingerprintCard = requiredCredentialTypes.includes("fingerprint_clearance_card");
    const existingCredentialTypes = new Set(
      (credentialsByEmployee.get(applicant.id) || []).map((c) =>
        normalizeCredentialTypeKey(c.credential_type)
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

    const st = String(applicant.status || "").toLowerCase().trim();
    const activationBlocked =
      (st === "onboarding" || st === "applicant") &&
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

    employeeReadinessById.set(applicant.id, {
      isSurveyReady,
      activationBlocked,
      hasIncompleteHireFile,
    });
  });

  const surveyNotReadyEmployeeIds = new Set(
    applicants.filter((a) => !employeeReadinessById.get(a.id)?.isSurveyReady).map((a) => a.id)
  );

  const activationBlockedEmployeeIds = new Set(
    applicants.filter((a) => employeeReadinessById.get(a.id)?.activationBlocked).map((a) => a.id)
  );

  const rowsUncached: EmployeeDirectoryRow[] = applicants.map((applicant) => {
    const employeeEvents = complianceEvents.filter((e) => e.applicant_id === applicant.id);
    const employeeForms = adminForms.filter((f) => f.employee_id === applicant.id);
    const stage = getEmployeeStage(employeeEvents, employeeForms);
    const ns = String(applicant.status || "").toLowerCase().trim();
    const phoneRaw = typeof applicant.phone === "string" ? applicant.phone : "";
    const e164 = normalizeDialInputToE164(phoneRaw);

    const readyToActivate =
      ns === "onboarding" &&
      !missingCredentialEmployeeIds.has(applicant.id) &&
      !overdueCredentialEmployeeIds.has(applicant.id) &&
      !annualOverdueEmployeeIds.has(applicant.id);

    const inApplicantOnboardingBucket =
      ns === "onboarding" || ns === "applicant" || ns === "";

    const inProcessBucket =
      ns !== "active" && ns !== "inactive" && stage.label !== DASHBOARD_STAGE_ACTIVE_EMPLOYEE;

    const hasComplianceSurveyGaps =
      surveyNotReadyEmployeeIds.has(applicant.id) ||
      missingCredentialEmployeeIds.has(applicant.id) ||
      annualMissingEmployeeIds.has(applicant.id) ||
      annualOverdueEmployeeIds.has(applicant.id) ||
      overdueCredentialEmployeeIds.has(applicant.id) ||
      activationBlockedEmployeeIds.has(applicant.id);

    const criticalCompliance =
      annualOverdueEmployeeIds.has(applicant.id) || overdueCredentialEmployeeIds.has(applicant.id);

    let complianceTone: EmployeeDirectoryRow["complianceTone"];
    let complianceLabel: string;
    if (criticalCompliance) {
      complianceTone = "red";
      complianceLabel = annualOverdueEmployeeIds.has(applicant.id)
        ? "Annual overdue"
        : "Credential overdue";
    } else if (hasComplianceSurveyGaps) {
      complianceTone = "amber";
      complianceLabel = "Needs attention";
    } else {
      complianceTone = "green";
      complianceLabel = "Clear";
    }

    const emp = employmentStatusPresentation(ns === "" ? "applicant" : ns);

    const updatedRaw =
      (typeof applicant.updated_at === "string" && applicant.updated_at) ||
      (typeof applicant.created_at === "string" && applicant.created_at) ||
      "";
    const lastUpdatedMs = updatedRaw ? new Date(updatedRaw).getTime() : 0;

    return {
      applicant,
      nameDisplay: employeeName(applicant),
      roleDisplay: roleDisplay(applicant),
      normalizedStatus: ns,
      employmentStatusLabel: emp.label,
      employmentStatusBadgeClass: emp.badgeClass,
      employmentStatusSortKey: emp.sortKey,
      stageLabel: stage.label,
      stageTone: stage.tone,
      e164,
      readyToActivate,
      inApplicantOnboardingBucket,
      inProcessBucket,
      hasComplianceSurveyGaps,
      complianceTone,
      complianceLabel,
      lastUpdatedMs,
    };
  });

  return { rows: rowsUncached, loadError: null };
}

export type EmployeeDirectorySortKey = "name" | "status" | "updated";
export type EmployeeDirectorySortDir = "asc" | "desc";

export function filterEmployeeDirectoryRows(
  rows: EmployeeDirectoryRow[],
  segment: EmployeeDirectorySegment,
  q: string,
  sort: EmployeeDirectorySortKey = "updated",
  sortDir: EmployeeDirectorySortDir = "desc"
): EmployeeDirectoryRow[] {
  const needle = q.trim().toLowerCase();
  const needleDigits = needle.replace(/\D/g, "");

  let out = rows;

  switch (segment) {
    case "active":
      out = out.filter((r) => r.normalizedStatus === "active");
      break;
    case "inactive":
      out = out.filter((r) => r.normalizedStatus === "inactive");
      break;
    case "in_process":
      out = out.filter((r) => r.inProcessBucket);
      break;
    case "applicant_onboarding":
      out = out.filter((r) => r.inApplicantOnboardingBucket);
      break;
    case "ready_to_activate":
      out = out.filter((r) => r.readyToActivate);
      break;
    case "compliance_gaps":
      out = out.filter((r) => r.hasComplianceSurveyGaps);
      break;
    default:
      break;
  }

  if (needle) {
    out = out.filter((r) => {
      const name = r.nameDisplay.toLowerCase();
      const email = String(r.applicant.email || "").toLowerCase();
      const phone = String(r.applicant.phone || "").toLowerCase();
      const role = r.roleDisplay.toLowerCase();
      const disc = String(r.applicant.discipline || "").toLowerCase();
      if (name.includes(needle)) return true;
      if (email.includes(needle)) return true;
      if (phone.includes(needle)) return true;
      if (role.includes(needle)) return true;
      if (disc.includes(needle)) return true;
      if (needleDigits.length >= 3) {
        const d = String(r.applicant.phone || "").replace(/\D/g, "");
        if (d.includes(needleDigits)) return true;
      }
      return false;
    });
  }

  const mul = sortDir === "asc" ? 1 : -1;
  const statusOrder: Record<string, number> = {
    active: 0,
    inactive: 1,
    in_process: 2,
    applicant: 3,
  };

  out = [...out].sort((a, b) => {
    if (sort === "name") {
      return mul * a.nameDisplay.localeCompare(b.nameDisplay, undefined, { sensitivity: "base" });
    }
    if (sort === "status") {
      const ak = statusOrder[a.employmentStatusSortKey] ?? 9;
      const bk = statusOrder[b.employmentStatusSortKey] ?? 9;
      if (ak !== bk) return mul * (ak - bk);
      return a.nameDisplay.localeCompare(b.nameDisplay, undefined, { sensitivity: "base" });
    }
    const diff = a.lastUpdatedMs - b.lastUpdatedMs;
    if (diff !== 0) return mul * diff;
    return a.nameDisplay.localeCompare(b.nameDisplay, undefined, { sensitivity: "base" });
  });

  return out.slice(0, 120);
}
