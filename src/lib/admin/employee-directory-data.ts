import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { SMS_REMINDER_CREDENTIAL_TYPE_SET } from "@/lib/admin/credential-sms-constants";
import { applicantRolePrimaryForCompliance } from "@/lib/applicant-role-for-compliance";
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
  | "due_soon"
  | "missing_credentials"
  | "expired"
  | "annuals_due"
  | "ready_to_activate"
  | "activation_blocked";

/** Per tracking column / CHAP-relevant item. */
export type ComplianceItemTier = "ok" | "due_soon" | "missing" | "expired" | "na";

export type ComplianceItemSnapshot = {
  key: string;
  label: string;
  tier: ComplianceItemTier;
  hint: string;
};

/** Rolled-up readiness for command-center triage. */
export type CommandComplianceStatus = "clear" | "due_soon" | "missing_expired";

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

export function normalizeCredentialTypeKey(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();
  if (t === "insurance") return "independent_contractor_insurance";
  return t;
}

export function getRequiredCredentialTypes(
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

function credentialSnapshot(
  key: string,
  label: string,
  required: boolean,
  creds: CredentialRecord[]
): ComplianceItemSnapshot {
  if (!required) {
    return { key, label, tier: "na", hint: `${label}: not required for this role` };
  }
  const st = getCredentialStateForType(key, creds);
  const tier: ComplianceItemTier =
    st.label === "Active"
      ? "ok"
      : st.label === "Due Soon"
        ? "due_soon"
        : st.label === "Expired"
          ? "expired"
          : "missing";
  return { key, label, tier, hint: `${label}: ${st.label}` };
}

function worstInsuranceTier(
  requiredTypes: string[],
  creds: CredentialRecord[]
): ComplianceItemSnapshot {
  const needAuto = requiredTypes.includes("auto_insurance");
  const needIc = requiredTypes.includes("independent_contractor_insurance");
  if (!needAuto && !needIc) {
    return {
      key: "insurance",
      label: "Ins",
      tier: "na",
      hint: "Insurance: not required",
    };
  }
  const auto = needAuto ? getCredentialStateForType("auto_insurance", creds) : null;
  const ic = needIc ? getCredentialStateForType("independent_contractor_insurance", creds) : null;
  const states = [auto, ic].filter(Boolean) as { label: string }[];
  const rank = (l: string) =>
    l === "Missing" ? 4 : l === "Expired" ? 3 : l === "Due Soon" ? 2 : l === "Active" ? 0 : 1;
  let worst = "Active";
  for (const s of states) {
    if (rank(s.label) > rank(worst)) worst = s.label;
  }
  const tier: ComplianceItemTier =
    worst === "Active"
      ? "ok"
      : worst === "Due Soon"
        ? "due_soon"
        : worst === "Expired"
          ? "expired"
          : "missing";
  const label = needIc && needAuto ? "Ins" : needIc ? "IC ins" : "Auto ins";
  return {
    key: "insurance",
    label,
    tier,
    hint: `Insurance (${label}): ${worst}`,
  };
}

function annualProgramSnapshot(
  key: string,
  label: string,
  inHiredPipeline: boolean,
  events: ComplianceEvent[],
  eventType: string
): ComplianceItemSnapshot {
  if (!inHiredPipeline) {
    return { key, label, tier: "na", hint: `${label}: not in hire pipeline yet` };
  }
  const matches = events.filter((e) => (e.event_type || "").toLowerCase().trim() === eventType);
  const ev =
    matches.sort((a, b) => {
      const aT = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bT = b.due_date ? new Date(b.due_date).getTime() : 0;
      return bT - aT;
    })[0] || null;
  if (!ev) {
    return { key, label, tier: "missing", hint: `${label}: no compliance event on file` };
  }
  if (ev.status === "completed" || ev.completed_at) {
    return { key, label, tier: "ok", hint: `${label}: complete` };
  }
  const days = getDaysUntil(ev.due_date);
  if (days === null) {
    return { key, label, tier: "missing", hint: `${label}: no due date` };
  }
  if (days < 0) {
    return { key, label, tier: "expired", hint: `${label}: overdue (${Math.abs(days)}d)` };
  }
  if (days <= 30) {
    return { key, label, tier: "due_soon", hint: `${label}: due in ${days}d` };
  }
  return { key, label, tier: "ok", hint: `${label}: current (due in ${days}d)` };
}

function skillsLikeSnapshot(
  key: string,
  label: string,
  inHiredPipeline: boolean,
  event: ComplianceEvent | null,
  formStatus: string | null | undefined
): ComplianceItemSnapshot {
  if (!inHiredPipeline) {
    return { key, label, tier: "na", hint: `${label}: not in hire pipeline yet` };
  }
  const complete =
    formStatus === "finalized" ||
    event?.status === "completed" ||
    Boolean(event?.completed_at);
  if (complete) {
    return { key, label, tier: "ok", hint: `${label}: complete` };
  }
  if (!event) {
    return { key, label, tier: "missing", hint: `${label}: not scheduled` };
  }
  const days = getDaysUntil(event.due_date);
  if (days === null) {
    return { key, label, tier: "missing", hint: `${label}: open` };
  }
  if (days < 0) {
    return { key, label, tier: "expired", hint: `${label}: overdue` };
  }
  if (days <= 30) {
    return { key, label, tier: "due_soon", hint: `${label}: due in ${days}d` };
  }
  return { key, label, tier: "due_soon", hint: `${label}: in progress` };
}

function rollupCommandComplianceStatus(
  items: ComplianceItemSnapshot[],
  hasCredentialOverdue: boolean,
  hasActivationBlocked: boolean
): CommandComplianceStatus {
  if (hasCredentialOverdue) return "missing_expired";
  const relevant = items.filter((i) => i.tier !== "na");
  const tiers = relevant.map((i) => i.tier);
  if (tiers.some((t) => t === "missing" || t === "expired")) return "missing_expired";
  if (tiers.some((t) => t === "due_soon")) return "due_soon";
  if (hasActivationBlocked) return "due_soon";
  return "clear";
}

export function complianceItemPillClass(tier: ComplianceItemTier): string {
  switch (tier) {
    case "ok":
      return "border border-emerald-200 bg-emerald-50 text-emerald-900";
    case "due_soon":
      return "border border-amber-200 bg-amber-50 text-amber-900";
    case "missing":
      return "border border-slate-200 bg-slate-100 text-slate-700";
    case "expired":
      return "border border-red-200 bg-red-50 text-red-900";
    case "na":
    default:
      return "border border-slate-100 bg-slate-50 text-slate-400";
  }
}

export function commandCompliancePresentation(status: CommandComplianceStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "missing_expired":
      return {
        label: "Missing / expired",
        badgeClass: "border border-red-200 bg-red-50 text-red-900",
      };
    case "due_soon":
      return {
        label: "Due soon",
        badgeClass: "border border-amber-200 bg-amber-50 text-amber-900",
      };
    case "clear":
    default:
      return {
        label: "Clear",
        badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-900",
      };
  }
}

function employeeName(a: ApplicantRecord): string {
  const full = `${a.first_name || ""} ${a.last_name || ""}`.trim();
  return full || "Unnamed";
}

function roleDisplay(a: ApplicantRecord): string {
  return applicantRolePrimaryForCompliance(a) || "—";
}

/** Directory employment bucket after reconciling `applicants.status` with onboarding stage (finalized forms). */
export type EffectiveEmploymentKey = "active" | "inactive" | "in_process" | "applicant";

export type EmployeeDirectoryRow = {
  applicant: ApplicantRecord;
  nameDisplay: string;
  roleDisplay: string;
  /** Raw `applicants.status` (lowercased); kept for pipeline rules tied to DB column. */
  normalizedStatus: string;
  /** Reconciled employment for display and Active/Inactive/In process filters. */
  effectiveEmploymentKey: EffectiveEmploymentKey;
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
  /** Legacy: any gap used by dashboard-style alerts. */
  hasComplianceSurveyGaps: boolean;
  commandComplianceStatus: CommandComplianceStatus;
  commandComplianceLabel: string;
  commandComplianceBadgeClass: string;
  complianceItems: ComplianceItemSnapshot[];
  flagMissingCredential: boolean;
  flagExpiredCredential: boolean;
  flagExpiringSoon: boolean;
  /** Annual overdue, missing annual coverage, or annual due within 30d (incomplete). */
  flagAnnualDue: boolean;
  flagOnboardingIncomplete: boolean;
  flagActivationBlocked: boolean;
  /** 0 = clear, 1 = due soon, 2 = missing/expired — for severity sort. */
  readinessSortRank: number;
  /** Weighted blocker score — higher = more operational risk. */
  flagSeverityScore: number;
  /** Role/contractor requirements; used for insurance deep link target. */
  requiredCredentialTypes: string[];
  /** Count of SMS-scoped credentials that are missing, expired, or due within 30 days. */
  credentialReminderTargetCount: number;
  /** Latest `employee_credential_reminder_sends.created_at` for this applicant, if any. */
  credentialReminderLastSentAt: string | null;
  /** True if at least one logged send used reminder_stage `due_soon_30`. */
  credentialReminderSentDueSoon30: boolean;
  /** True if at least one logged send used reminder_stage `due_soon_7`. */
  credentialReminderSentDueSoon7: boolean;
  /** True if at least one logged send used reminder_stage `expired`. */
  credentialReminderSentExpired: boolean;
  /** True if at least one logged send used reminder_stage `missing`. */
  credentialReminderSentMissing: boolean;
  lastUpdatedMs: number;
};

/** Maps a canonical employment bucket to pill + sort key. */
function employmentBucketPresentation(key: EffectiveEmploymentKey): {
  label: string;
  badgeClass: string;
  sortKey: string;
} {
  switch (key) {
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
    case "in_process":
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

/**
 * Directory employment: prefer operational truth over a stale `applicants.status`.
 * - Inactive in DB always wins.
 * - Active if status is `active` OR onboarding stage is "Active Employee" (any finalized admin form).
 * - In process if status is `onboarding` (and not already treated as active above).
 * - Otherwise applicant / pre-hire.
 */
type CredentialReminderSendLite = {
  applicant_id: string;
  reminder_stage: string;
  created_at: string;
};

async function loadCredentialReminderSummaryByApplicant(
  applicantIds: string[]
): Promise<
  Map<
    string,
    {
      lastSentAt: string | null;
      sentDueSoon30: boolean;
      sentDueSoon7: boolean;
      sentExpired: boolean;
      sentMissing: boolean;
    }
  >
> {
  const out = new Map<
    string,
    {
      lastSentAt: string | null;
      sentDueSoon30: boolean;
      sentDueSoon7: boolean;
      sentExpired: boolean;
      sentMissing: boolean;
    }
  >();
  if (applicantIds.length === 0) return out;

  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from("employee_credential_reminder_sends")
      .select("applicant_id, reminder_stage, created_at")
      .in("applicant_id", applicantIds)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn("[loadEmployeeDirectoryRows] credential reminder history:", error.message);
      break;
    }

    const batch = (data || []) as CredentialReminderSendLite[];
    for (const row of batch) {
      const id = row.applicant_id;
      const created = row.created_at;
      const stage = row.reminder_stage;
      let cur = out.get(id);
      if (!cur) {
        cur = {
          lastSentAt: null,
          sentDueSoon30: false,
          sentDueSoon7: false,
          sentExpired: false,
          sentMissing: false,
        };
        out.set(id, cur);
      }
      const rowMs = new Date(created).getTime();
      const curMs = cur.lastSentAt ? new Date(cur.lastSentAt).getTime() : 0;
      if (rowMs > curMs) cur.lastSentAt = created;
      if (stage === "due_soon_30" || stage === "due_soon") cur.sentDueSoon30 = true;
      if (stage === "due_soon_7") cur.sentDueSoon7 = true;
      if (stage === "expired") cur.sentExpired = true;
      if (stage === "missing") cur.sentMissing = true;
    }

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return out;
}

export function deriveEffectiveEmploymentKey(
  normalizedApplicantStatus: string,
  stageLabel: string
): EffectiveEmploymentKey {
  const ns = normalizedApplicantStatus;
  if (ns === "inactive") return "inactive";
  if (ns === "active" || stageLabel === DASHBOARD_STAGE_ACTIVE_EMPLOYEE) return "active";
  if (ns === "onboarding") return "in_process";
  return "applicant";
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
      applicantRolePrimaryForCompliance(applicant),
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
        applicantRolePrimaryForCompliance(applicant),
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

  const directoryCommandById = new Map<
    string,
    {
      complianceItems: ComplianceItemSnapshot[];
      commandComplianceStatus: CommandComplianceStatus;
      commandComplianceLabel: string;
      commandComplianceBadgeClass: string;
      flagMissingCredential: boolean;
      flagExpiredCredential: boolean;
      flagExpiringSoon: boolean;
      flagAnnualDue: boolean;
      flagOnboardingIncomplete: boolean;
      flagActivationBlocked: boolean;
    }
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
      applicantRolePrimaryForCompliance(applicant),
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

    const creds = credentialsByEmployee.get(applicant.id) || [];
    const inHiredPipeline =
      st === "active" ||
      st === "onboarding" ||
      complianceEvents.some((e) => e.applicant_id === applicant.id) ||
      annualComplianceEvents.some((e) => e.applicant_id === applicant.id) ||
      employeeForms.length > 0;

    const complianceItems: ComplianceItemSnapshot[] = [];
    complianceItems.push(
      credentialSnapshot(
        "professional_license",
        "Lic",
        requiredCredentialTypes.includes("professional_license"),
        creds
      )
    );
    complianceItems.push(
      credentialSnapshot("cpr", "CPR", requiredCredentialTypes.includes("cpr"), creds)
    );
    complianceItems.push(
      credentialSnapshot(
        "tb_expiration",
        "TB",
        requiredCredentialTypes.includes("tb_expiration"),
        creds
      )
    );
    complianceItems.push(
      credentialSnapshot(
        "drivers_license",
        "DL",
        requiredCredentialTypes.includes("drivers_license"),
        creds
      )
    );
    complianceItems.push(worstInsuranceTier(requiredCredentialTypes, creds));
    complianceItems.push(
      skillsLikeSnapshot(
        "skills",
        "Skills",
        inHiredPipeline,
        currentSkillsEvent,
        currentSkillsForm?.status
      )
    );
    complianceItems.push(
      skillsLikeSnapshot(
        "performance",
        "Perf",
        inHiredPipeline,
        currentPerformanceEvent,
        currentPerformanceForm?.status
      )
    );
    complianceItems.push(
      annualProgramSnapshot(
        "annual_tb_stmt",
        "TB yr",
        inHiredPipeline,
        employeeAnnualEvents,
        "annual_tb_statement"
      )
    );
    complianceItems.push(
      annualProgramSnapshot(
        "annual_train",
        "Train",
        inHiredPipeline,
        employeeAnnualEvents,
        "annual_training"
      )
    );
    complianceItems.push(
      annualProgramSnapshot(
        "annual_contract_rev",
        "Rev",
        inHiredPipeline,
        employeeAnnualEvents,
        "annual_contract_review"
      )
    );

    const hasCredentialOverdue = (requiredCredentialReminderByEmployee.get(applicant.id) || []).some(
      (s) => s.label === "Overdue"
    );

    const commandComplianceStatus = rollupCommandComplianceStatus(
      complianceItems,
      hasCredentialOverdue,
      activationBlocked
    );
    const cmdPres = commandCompliancePresentation(commandComplianceStatus);

    const flagMissingCredential = missingCredentialEmployeeIds.has(applicant.id);
    const flagExpiredCredential = hasExpiredRequiredCredentials;
    const flagExpiringSoon =
      requiredCredentialStates.some((s) => s.label === "Due Soon") ||
      employeeAnnualEvents.some((e) => {
        if (e.status === "completed" || e.completed_at) return false;
        const d = getDaysUntil(e.due_date);
        return typeof d === "number" && d >= 0 && d <= 30;
      });

    const flagAnnualDue =
      inHiredPipeline &&
      (annualComplianceDefinitions.some(
        (def) => !employeeAnnualEvents.some((e) => e.event_type === def.eventType)
      ) ||
        employeeAnnualEvents.some((e) => {
          if (e.status === "completed" || e.completed_at) return false;
          const d = getDaysUntil(e.due_date);
          return typeof d === "number" && d <= 30;
        }));

    directoryCommandById.set(applicant.id, {
      complianceItems,
      commandComplianceStatus,
      commandComplianceLabel: cmdPres.label,
      commandComplianceBadgeClass: cmdPres.badgeClass,
      flagMissingCredential,
      flagExpiredCredential,
      flagExpiringSoon,
      flagAnnualDue,
      flagOnboardingIncomplete: hasIncompleteHireFile,
      flagActivationBlocked: activationBlocked,
    });
  });

  const surveyNotReadyEmployeeIds = new Set(
    applicants.filter((a) => !employeeReadinessById.get(a.id)?.isSurveyReady).map((a) => a.id)
  );

  const activationBlockedEmployeeIds = new Set(
    applicants.filter((a) => employeeReadinessById.get(a.id)?.activationBlocked).map((a) => a.id)
  );

  const credentialReminderSummaryByApplicant = await loadCredentialReminderSummaryByApplicant(applicantIds);

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

    const effectiveKey = deriveEffectiveEmploymentKey(ns, stage.label);
    const emp = employmentBucketPresentation(effectiveKey);

    /** Legacy pipeline bucket (differs from directory “In process” segment, which uses `effectiveEmploymentKey`). */
    const inProcessBucket =
      ns !== "active" && ns !== "inactive" && stage.label !== DASHBOARD_STAGE_ACTIVE_EMPLOYEE;

    const hasComplianceSurveyGaps =
      surveyNotReadyEmployeeIds.has(applicant.id) ||
      missingCredentialEmployeeIds.has(applicant.id) ||
      annualMissingEmployeeIds.has(applicant.id) ||
      annualOverdueEmployeeIds.has(applicant.id) ||
      overdueCredentialEmployeeIds.has(applicant.id) ||
      activationBlockedEmployeeIds.has(applicant.id);

    const aug = directoryCommandById.get(applicant.id) ?? {
      complianceItems: [] as ComplianceItemSnapshot[],
      commandComplianceStatus: "clear" as CommandComplianceStatus,
      commandComplianceLabel: "Clear",
      commandComplianceBadgeClass: commandCompliancePresentation("clear").badgeClass,
      flagMissingCredential: false,
      flagExpiredCredential: false,
      flagExpiringSoon: false,
      flagAnnualDue: false,
      flagOnboardingIncomplete: false,
      flagActivationBlocked: false,
    };

    const updatedRaw =
      (typeof applicant.updated_at === "string" && applicant.updated_at) ||
      (typeof applicant.created_at === "string" && applicant.created_at) ||
      "";
    const lastUpdatedMs = updatedRaw ? new Date(updatedRaw).getTime() : 0;

    const requiredCredentialTypes = getRequiredCredentialTypes(
      applicantRolePrimaryForCompliance(applicant),
      employmentClassificationByEmployee.get(applicant.id) || null
    );

    const readinessSortRank =
      aug.commandComplianceStatus === "missing_expired"
        ? 2
        : aug.commandComplianceStatus === "due_soon"
          ? 1
          : 0;

    const flagSeverityScore =
      (aug.flagActivationBlocked ? 32 : 0) +
      (aug.flagMissingCredential ? 16 : 0) +
      (aug.flagExpiredCredential ? 12 : 0) +
      (aug.flagAnnualDue ? 8 : 0) +
      (aug.flagOnboardingIncomplete ? 4 : 0) +
      (aug.flagExpiringSoon ? 2 : 0);

    const credRowsForSms = credentialsByEmployee.get(applicant.id) || [];
    let credentialReminderTargetCount = 0;
    for (const ct of requiredCredentialTypes) {
      if (!SMS_REMINDER_CREDENTIAL_TYPE_SET.has(ct)) continue;
      if (getCredentialStateForType(ct, credRowsForSms).label !== "Active") {
        credentialReminderTargetCount += 1;
      }
    }

    const remSummary = credentialReminderSummaryByApplicant.get(applicant.id);

    return {
      applicant,
      nameDisplay: employeeName(applicant),
      roleDisplay: roleDisplay(applicant),
      normalizedStatus: ns,
      effectiveEmploymentKey: effectiveKey,
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
      commandComplianceStatus: aug.commandComplianceStatus,
      commandComplianceLabel: aug.commandComplianceLabel,
      commandComplianceBadgeClass: aug.commandComplianceBadgeClass,
      complianceItems: aug.complianceItems,
      flagMissingCredential: aug.flagMissingCredential,
      flagExpiredCredential: aug.flagExpiredCredential,
      flagExpiringSoon: aug.flagExpiringSoon,
      flagAnnualDue: aug.flagAnnualDue,
      flagOnboardingIncomplete: aug.flagOnboardingIncomplete,
      flagActivationBlocked: aug.flagActivationBlocked,
      readinessSortRank,
      flagSeverityScore,
      requiredCredentialTypes,
      credentialReminderTargetCount,
      credentialReminderLastSentAt: remSummary?.lastSentAt ?? null,
      credentialReminderSentDueSoon30: remSummary?.sentDueSoon30 ?? false,
      credentialReminderSentDueSoon7: remSummary?.sentDueSoon7 ?? false,
      credentialReminderSentExpired: remSummary?.sentExpired ?? false,
      credentialReminderSentMissing: remSummary?.sentMissing ?? false,
      lastUpdatedMs,
    };
  });

  return { rows: rowsUncached, loadError: null };
}

export type EmployeeDirectorySortKey = "name" | "status" | "updated" | "readiness" | "flags";
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
      out = out.filter((r) => r.effectiveEmploymentKey === "active");
      break;
    case "inactive":
      out = out.filter((r) => r.effectiveEmploymentKey === "inactive");
      break;
    case "in_process":
      out = out.filter((r) => r.effectiveEmploymentKey === "in_process");
      break;
    case "due_soon":
      out = out.filter((r) => r.commandComplianceStatus === "due_soon");
      break;
    case "missing_credentials":
      out = out.filter((r) => r.flagMissingCredential);
      break;
    case "expired":
      out = out.filter(
        (r) =>
          r.flagExpiredCredential || r.complianceItems.some((i) => i.tier === "expired")
      );
      break;
    case "annuals_due":
      out = out.filter((r) => r.flagAnnualDue);
      break;
    case "ready_to_activate":
      out = out.filter((r) => r.readyToActivate);
      break;
    case "activation_blocked":
      out = out.filter((r) => r.flagActivationBlocked);
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
    if (sort === "readiness") {
      const diff = a.readinessSortRank - b.readinessSortRank;
      if (diff !== 0) return mul * diff;
      const s2 = a.flagSeverityScore - b.flagSeverityScore;
      if (s2 !== 0) return mul * s2;
      return mul * (a.lastUpdatedMs - b.lastUpdatedMs);
    }
    if (sort === "flags") {
      const diff = a.flagSeverityScore - b.flagSeverityScore;
      if (diff !== 0) return mul * diff;
      const r2 = a.readinessSortRank - b.readinessSortRank;
      if (r2 !== 0) return mul * r2;
      return mul * (a.lastUpdatedMs - b.lastUpdatedMs);
    }
    const diff = a.lastUpdatedMs - b.lastUpdatedMs;
    if (diff !== 0) return mul * diff;
    return a.nameDisplay.localeCompare(b.nameDisplay, undefined, { sensitivity: "base" });
  });

  return out.slice(0, 120);
}
