import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/admin";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { insertAuditLog } from "@/lib/audit-log";
import { skillsCompetencyDisciplines } from "@/lib/skills-competency";
import { performanceEvaluationDisciplines } from "@/lib/performance-evaluation";
import {
  EmployeeContractRow,
  inferContractRoleFromText,
} from "@/lib/employee-contracts";
import {
  EmployeeTaxFormRow,
  getTaxFormLabel,
} from "@/lib/employee-tax-forms";
import ComplianceEventManager from "@/app/admin/compliance-event-manager";
import CredentialManager from "./CredentialManager";
import EmployeeContractTaxSection from "./EmployeeContractTaxSection";
import EmployeeOnboardingCard from "./EmployeeOnboardingCard";
import {
  applicantRolePrimaryForCompliance,
  type ApplicantRoleFields,
} from "@/lib/applicant-role-for-compliance";
import { getCredentialAnchorId } from "@/lib/credential-anchors";
import { EmployeeArchiveButton } from "@/app/admin/employees/EmployeeArchiveButton";
import { buildUnifiedOnboardingState } from "@/lib/onboarding/unified-onboarding-state";
import AdminOnboardingCommandCenter from "./admin-onboarding-command-center";
import EmployeeAdminActionRequiredTable from "./employee-admin-action-required-table";
import EmployeeAdminSnapshotStrip from "./employee-admin-snapshot-strip";
import type { PersonnelFileAuditItem } from "./personnel-file-audit-deferred";
import OnboardingWorkflowSectionCollapsible from "./onboarding-workflow-section-collapsible";
import PersonnelFileAuditDeferred from "./personnel-file-audit-loader";
import { WorkflowStatusCard } from "./workflow-status-card";

import CredentialReminderCappedTable from "./credential-reminder-capped-table";
import EmployeeDocumentsComplianceDashboard, {
  type DashboardHistoryEntry,
  type ExpiringCredentialRowDef,
  type InitialHiringRowDef,
  type OngoingComplianceRowDef,
} from "./employee-documents-compliance-dashboard";

type ComplianceEvent = {
  id: string;
  status: string | null;
  event_title: string | null;
  due_date: string | null;
  completed_at: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

type AdminFormRecord = {
  id: string;
  status: string | null;
  compliance_event_id: string | null;
  finalized_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  form_type?: string | null;
  form_data?: {
    discipline?: string;
    items?: Record<string, string>;
    [key: string]: unknown;
  } | null;
};

/** One row per compliance event in history: event-only, or event + linked admin form. */
type ComplianceHistoryRow = {
  event: ComplianceEvent;
  form: AdminFormRecord | null;
  printMeta: { canPrint: boolean; label: string };
  printHref: string | null;
};

type CredentialRecord = {
  id: string;
  employee_id: string;
  credential_type: string;
  credential_name: string | null;
  credential_number: string | null;
  issuing_state: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  uploaded_at?: string | null;
};

type ExitInterviewRecord = {
  id: string;
  employee_id: string;
  reason_for_leaving?: string | null;
  separation_type?: string | null;
  rehire_eligible?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
};

type SavedSurveyPacketRecord = {
  id: string;
  applicant_id: string;
  display_name?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  created_at?: string | null;
};

type ApplicantFileRecord = {
  id: string;
  applicant_id: string;
  document_type?: string | null;
  display_name?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  created_at?: string | null;
  viewUrl?: string | null;
};

type DocumentRecord = {
  id: string;
  applicant_id: string;
  document_type?: string | null;
  file_url?: string | null;
  created_at?: string | null;
};

type AdminUploadRecord = {
  document_type?: string | null;
  display_name?: string | null;
  file_name?: string | null;
  created_at?: string | null;
  viewUrl?: string | null;
};

/** Appends `inline=1` so the employee-file route uses Content-Disposition: inline for in-browser viewing. */
function appendEmployeeFileInlineView(href: string) {
  return href.includes("?") ? `${href}&inline=1` : `${href}?inline=1`;
}

type ProgressSummary = {
  completed: number;
  total: number;
  percent: number;
};

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? `${dateString}T00:00:00`
    : dateString;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString?: string | null) {
  if (!dateString) return "Not completed";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildAdminUploadHistoryDisplay(files: AdminUploadRecord[]): DashboardHistoryEntry[] {
  return files.map((file, index) => ({
    displayLine: `v${files.length - index} · ${file.created_at ? formatDate(file.created_at) : "—"}`,
    viewUrl: file.viewUrl ?? null,
  }));
}

function getBadgeClasses(tone: "green" | "red" | "amber" | "sky" | "slate") {
  switch (tone) {
    case "green":
      return "border border-green-200 bg-green-50 text-green-700";
    case "red":
      return "border border-red-200 bg-red-50 text-red-700";
    case "amber":
      return "border border-amber-200 bg-amber-50 text-amber-700";
    case "sky":
      return "border border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

function isComplianceRequirementComplete(
  event?: Pick<ComplianceEvent, "status" | "completed_at"> | null,
  form?: Pick<AdminFormRecord, "status"> | null
) {
  const formStatus = normalizeComplianceStatus(form?.status);
  return formStatus === "finalized" || isEventStatusCompleted(event);
}

function normalizeComplianceStatus(statusValue?: string | null) {
  return (statusValue || "").toLowerCase().trim();
}

function isEventStatusCompleted(
  event?: Pick<ComplianceEvent, "status" | "completed_at"> | null
) {
  const status = normalizeComplianceStatus(event?.status);
  return status === "completed" || status === "complete" || !!event?.completed_at;
}

function toDateMs(dateString?: string | null) {
  if (!dateString) return 0;
  const ms = new Date(dateString).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function overrideEventCompletionWithFinalizedForm(
  event: ComplianceEvent,
  finalizedAt?: string | null
): ComplianceEvent {
  if (!finalizedAt) return event;

  return {
    ...event,
    status: "completed",
    completed_at: event.completed_at || finalizedAt,
  };
}

function buildFinalizedAtByComplianceEventId(
  forms:
    | Array<Pick<AdminFormRecord, "compliance_event_id" | "finalized_at" | "created_at">>
    | null
    | undefined
): Map<string, string | null> {
  const map = new Map<string, string | null>();

  for (const form of forms || []) {
    const eventId = form.compliance_event_id;
    if (!eventId) continue;

    const candidateAt = form.finalized_at || form.created_at || null;
    const existingAt = map.get(eventId) ?? null;

    if (!existingAt || toDateMs(candidateAt) > toDateMs(existingAt)) {
      map.set(eventId, candidateAt);
    }
  }

  return map;
}

function selectAnnualDisplayEvent(
  events: ComplianceEvent[],
  finalizedAtByEventId: Map<string, string | null>
): ComplianceEvent | null {
  const effectiveEvents = events.map((event) => {
    const finalizedAt = finalizedAtByEventId.get(event.id) ?? null;
    return finalizedAt ? overrideEventCompletionWithFinalizedForm(event, finalizedAt) : event;
  });

  const openEvents = effectiveEvents.filter((event) => !isEventStatusCompleted(event));
  if (openEvents.length > 0) {
    return (
      openEvents.sort((a, b) => {
        return (
          toDateMs(b.due_date) - toDateMs(a.due_date) ||
          toDateMs(b.created_at) - toDateMs(a.created_at)
        );
      })[0] ?? null
    );
  }

  const completedEvents = effectiveEvents.filter((event) => isEventStatusCompleted(event));
  if (completedEvents.length > 0) {
    return (
      completedEvents.sort((a, b) => {
        const aCompletedMs = toDateMs(a.completed_at || a.due_date || a.created_at);
        const bCompletedMs = toDateMs(b.completed_at || b.due_date || b.created_at);
        return bCompletedMs - aCompletedMs || toDateMs(b.created_at) - toDateMs(a.created_at);
      })[0] ?? null
    );
  }

  if (effectiveEvents.length === 0) return null;

  return (
    effectiveEvents.sort((a, b) => {
      return (
        toDateMs(b.due_date) - toDateMs(a.due_date) ||
        toDateMs(b.created_at) - toDateMs(a.created_at)
      );
    })[0] ?? null
  );
}

function getButtonClasses(tone: "green" | "red" | "amber" | "sky" | "slate") {
  switch (tone) {
    case "green":
      return "bg-green-600 text-white shadow-green-200 hover:bg-green-700";
    case "red":
      return "bg-red-600 text-white shadow-red-200 hover:bg-red-700";
    case "amber":
      return "bg-amber-500 text-white shadow-amber-200 hover:bg-amber-600";
    case "sky":
      return "bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-sky-200 hover:-translate-y-0.5 hover:shadow-xl";
    default:
      return "bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800";
  }
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

function getExitInterviewPdfPath(employeeId: string) {
  return `exit-interviews/${employeeId}/exit-interview.pdf`;
}

function getRequirementState(
  event?: ComplianceEvent | null,
  form?: AdminFormRecord | null
) {
  const now = new Date();
  const dueDate = event?.due_date ? new Date(event?.due_date) : null;
  const isFormDraft = normalizeComplianceStatus(form?.status) === "draft";
  const isComplete = isComplianceRequirementComplete(event, form);
  const isOverdue =
    !isComplete &&
    !isFormDraft &&
    !!dueDate &&
    !Number.isNaN(dueDate.getTime()) &&
    dueDate.getTime() < now.getTime();

  if (isComplete) {
    return {
      label: "Completed",
      tone: "green" as const,
      buttonText: "View Form",
      description: "This annual requirement has been finalized and locked.",
    };
  }

  if (isFormDraft) {
    return {
      label: "Draft Saved",
      tone: "amber" as const,
      buttonText: "Continue Form",
      description: "A draft exists and is ready to continue.",
    };
  }

  if (isOverdue) {
    return {
      label: "Overdue",
      tone: "red" as const,
      buttonText: "Start Form",
      description: "This annual requirement is past due and still needs action.",
    };
  }

  if (event) {
    return {
      label: "Not Started",
      tone: "sky" as const,
      buttonText: "Open",
      description: "This annual requirement is scheduled and ready to begin.",
    };
  }

  return {
    label: "No Annual Event",
    tone: "slate" as const,
    buttonText: "Open",
    description: "No annual event has been scheduled yet.",
  };
}

function getProgressSummary(
  formType: "skills_competency" | "performance_evaluation",
  form?: AdminFormRecord | null
): ProgressSummary {
  type DisciplineDefinition = {
    id: string;
    items?: Array<{ id: string }>;
  };

  if (!form?.form_data) {
    return { completed: 0, total: 0, percent: 0 };
  }

  const disciplineId = String(form.form_data.discipline || "")
    .toLowerCase()
    .trim();

  const definitions =
    formType === "skills_competency"
      ? skillsCompetencyDisciplines
      : performanceEvaluationDisciplines;
  const typedDefinitions = definitions as DisciplineDefinition[];

  const selectedDiscipline =
    typedDefinitions.find((discipline) => discipline.id === disciplineId) ||
    typedDefinitions[0];

  const total = Array.isArray(selectedDiscipline?.items)
    ? selectedDiscipline.items.length
    : 0;

  const answeredItems = form.form_data.items || {};

  const completed = Array.isArray(selectedDiscipline?.items)
    ? selectedDiscipline.items.filter((item) => !!answeredItems[item.id]).length
    : 0;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percent };
}

function getPrintMeta(
  form?: AdminFormRecord | null,
  event?: ComplianceEvent | null
) {
  const isDraft = normalizeComplianceStatus(form?.status) === "draft";
  const isFinalized = isComplianceRequirementComplete(event, form);
  const canPrint = !!form;

  if (!canPrint) {
    return {
      canPrint: false,
      label: "",
    };
  }

  if (isFinalized) {
    return {
      canPrint: true,
      label: "Print Finalized PDF",
    };
  }

  if (isDraft) {
    return {
      canPrint: true,
      label: "Print Draft",
    };
  }

  return {
    canPrint: true,
    label: "Print",
  };
}

function getEventTypeLabel(eventType?: string | null) {
  switch ((eventType || "").toLowerCase().trim()) {
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
      return eventType || "Compliance Event";
  }
}

function getHistoryPrintHref(
  employeeId: string,
  event: ComplianceEvent,
  form?: AdminFormRecord | null
) {
  if (!form) return null;

  if ((event.event_type || "").toLowerCase().trim() === "skills_checklist") {
    return `/admin/employees/${employeeId}/forms/skills-competency/print?eventId=${event.id}`;
  }

  if (
    (event.event_type || "").toLowerCase().trim() ===
    "annual_performance_evaluation"
  ) {
    return `/admin/employees/${employeeId}/forms/performance-evaluation/print?eventId=${event.id}`;
  }

  return null;
}

function getAdminFormRecordLabel(formType?: string | null) {
  if ((formType || "").toLowerCase().trim() === "skills_competency") {
    return "Skills Competency";
  }

  if ((formType || "").toLowerCase().trim() === "performance_evaluation") {
    return "Performance Evaluation";
  }

  return "Admin Form";
}

function getAdminFormHistoryStatusLabel(
  form?: AdminFormRecord | null,
  isCurrent = false
) {
  if (!isCurrent) return "Superseded";
  return form?.status === "finalized" ? "Finalized" : "Draft";
}

function getAdminFormHistoryStatusClasses(
  form?: AdminFormRecord | null,
  isCurrent = false
) {
  if (!isCurrent) {
    return "bg-slate-100 text-slate-700";
  }

  return form?.status === "finalized"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-amber-50 text-amber-700";
}

/** Maps legacy/alias credential_type values to the canonical keys used in readiness rules. */
function normalizeCredentialTypeKey(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();
  if (t === "cpr" || t === "cpr_card" || t === "cpr_bls" || t === "bls_cpr") {
    return "cpr";
  }
  if (
    t === "fingerprint_clearance_card" ||
    t === "fingerprint_card" ||
    t === "az_fingerprint_clearance_card"
  ) {
    return "fingerprint_clearance_card";
  }
  if (t === "insurance") {
    return "independent_contractor_insurance";
  }
  return t;
}

function normalizeDocumentTypeLookupKey(type: string | null | undefined): string {
  return normalizeCredentialTypeKey(type).replace(/[\s-]+/g, "_");
}

function getCredentialRecencyTimestamp(credential: Pick<CredentialRecord, "uploaded_at" | "created_at">) {
  return new Date(credential.uploaded_at || credential.created_at || 0).getTime();
}

function getLatestCredentialsByType(credentials: CredentialRecord[]) {
  const latestByType = new Map<string, CredentialRecord>();

  credentials.forEach((credential) => {
    const normalizedType = normalizeCredentialTypeKey(credential.credential_type);
    if (!normalizedType) return;

    const existing = latestByType.get(normalizedType);
    if (!existing) {
      latestByType.set(normalizedType, credential);
      return;
    }

    const existingTimestamp = getCredentialRecencyTimestamp(existing);
    const candidateTimestamp = getCredentialRecencyTimestamp(credential);

    if (candidateTimestamp > existingTimestamp) {
      latestByType.set(normalizedType, credential);
    }
  });

  return Array.from(latestByType.values());
}

function formatCredentialType(type: string) {
  switch ((type || "").toLowerCase().trim()) {
    case "professional_license":
      return "Professional License";
    case "cpr":
      return "CPR";
    case "insurance":
      return "Liability Insurance";
    case "auto_insurance":
      return "Auto Insurance";
    case "independent_contractor_insurance":
      return "Independent Contractor Insurance";
    case "drivers_license":
      return "Driver’s License";
    case "fingerprint_clearance_card":
      return "AZ Fingerprint Clearance Card";
    case "tb_expiration":
      return "TB Expiration";
    default:
      return type || "Credential";
  }
}

function isIndependentContractorClassification(value?: string | null) {
  const normalized = (value || "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ");
  return (
    normalized === "contractor" ||
    normalized === "independent contractor" ||
    normalized === "1099" ||
    normalized === "ic" ||
    normalized.includes("contractor") ||
    normalized.includes("1099")
  );
}

function getRequiredCredentialTypes(
  roleValue?: string | null,
  employmentClassification?: EmployeeContractRow["employment_classification"] | null
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

  if (isIndependentContractorClassification(employmentClassification || null)) {
    requiredTypes.push("independent_contractor_insurance");
  }

  return Array.from(new Set(requiredTypes));
}

function getStringField(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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

function getCredentialStatus(dateString?: string | null) {
  const daysRemaining = getDaysRemaining(dateString);

  if (daysRemaining === null) {
    return {
      label: "Unknown",
      tone: "slate" as const,
      badgeClass: "border border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (daysRemaining < 0) {
    return {
      label: "Expired",
      tone: "red" as const,
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
    };
  }

  if (daysRemaining <= 30) {
    return {
      label: "Due Soon",
      tone: "amber" as const,
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Active",
    tone: "green" as const,
    badgeClass: "border border-green-200 bg-green-50 text-green-700",
  };
}

function getCredentialReminderStatus(dateString?: string | null) {
  const daysRemaining = getDaysRemaining(dateString);

  if (daysRemaining === null) {
    return {
      label: "No Expiration",
      tone: "slate" as const,
      badgeClass: "border border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (daysRemaining < 0) {
    return {
      label: "Overdue",
      tone: "red" as const,
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
    };
  }

  if (daysRemaining <= 7) {
    return {
      label: "Urgent",
      tone: "red" as const,
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
    };
  }

  if (daysRemaining <= 30) {
    return {
      label: "Due Soon",
      tone: "amber" as const,
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Active",
    tone: "green" as const,
    badgeClass: "border border-green-200 bg-green-50 text-green-700",
  };
}

function getAnnualReminderStatus(event?: ComplianceEvent | null) {
  if (!event || isEventStatusCompleted(event)) {
    return null;
  }

  const daysRemaining = getDaysRemaining(event.due_date);

  if (daysRemaining === null) {
    return {
      label: "Pending",
      tone: "sky" as const,
      badgeClass: "border border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (daysRemaining < 0) {
    return {
      label: "Overdue",
      tone: "red" as const,
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
    };
  }

  if (daysRemaining <= 7) {
    return {
      label: "Urgent",
      tone: "red" as const,
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
    };
  }

  if (daysRemaining <= 30) {
    return {
      label: "Due Soon",
      tone: "amber" as const,
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Pending",
    tone: "sky" as const,
    badgeClass: "border border-sky-200 bg-sky-50 text-sky-700",
  };
}

function getRequiredCredentialState(
  credentialType: string,
  credentials: CredentialRecord[]
) {
  const matches = credentials.filter(
    (credential) => normalizeCredentialTypeKey(credential.credential_type) === credentialType
  );

  if (matches.length === 0) {
    return {
      label: "Missing",
      tone: "red" as const,
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
      credential: null,
    };
  }

  const credential =
    matches
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.uploaded_at || a.created_at || 0).getTime();
        const bTime = new Date(b.uploaded_at || b.created_at || 0).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return (b.expiration_date || "").localeCompare(a.expiration_date || "");
      })[0] || null;

  const status = getCredentialStatus(credential?.expiration_date);

  if (status.label === "Unknown") {
    return {
      label: "No Expiration",
      tone: "slate" as const,
      badgeClass: "border border-slate-200 bg-slate-50 text-slate-700",
      credential,
    };
  }

  return {
    ...status,
    credential,
  };
}

function addYears(date: Date, years: number) {
  const nextDate = new Date(date);
  nextDate.setFullYear(nextDate.getFullYear() + years);
  return nextDate;
}

function formatDateForInsert(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getLatestApplicantFile(
  files: AdminUploadRecord[],
  documentType: string
): AdminUploadRecord | null {
  const targetType = normalizeDocumentTypeLookupKey(documentType);
  return (
    files.find(
      (file) => normalizeDocumentTypeLookupKey(file.document_type) === targetType
    ) || null
  );
}

function getStorageObjectFromPublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;

  const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);

  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

function VersionedEventCard({
  employeeId,
  title,
  subtitle,
  href,
  printHref,
  event,
  form,
  progress,
  historyForms,
}: {
  employeeId: string;
  title: string;
  subtitle: string;
  href: string;
  printHref: string;
  event?: ComplianceEvent | null;
  form?: AdminFormRecord | null;
  progress: ProgressSummary;
  historyForms: AdminFormRecord[];
}) {
  const state = getRequirementState(event, form);
  const printMeta = getPrintMeta(form, event);
  const isLocked = isComplianceRequirementComplete(event, form);
  const startNewVersionHref =
    event?.id && isLocked
      ? `${href}${href.includes("?") ? "&" : "?"}startNewVersion=1`
      : null;
  const currentVersionNumber = form
    ? historyForms.length - historyForms.findIndex((item) => item.id === form.id)
    : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>

          <span
            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
              state.tone
            )}`}
          >
            {state.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Current Record
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{title}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Version
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {currentVersionNumber ?? "—"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Status
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getAdminFormHistoryStatusClasses(
                  form,
                  true
                )}`}
              >
                {getAdminFormHistoryStatusLabel(form, true)}
              </span>
              {form ? (
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  Current
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Created
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {formatDateTime(form?.created_at)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Completed
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {formatDateTime(form?.finalized_at || event?.completed_at)}
            </p>
          </div>
        </div>

        {progress.total > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              <span>Form Completion</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="rounded-[22px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {state.description}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={href}
            className={`inline-flex items-center justify-center rounded-[24px] px-5 py-3 text-sm font-semibold shadow-md transition ${getButtonClasses(
              state.tone
            )}`}
          >
            {state.buttonText}
          </Link>

          {startNewVersionHref ? (
            <Link
              href={startNewVersionHref}
              className="inline-flex items-center justify-center rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
            >
              Start New Version
            </Link>
          ) : null}

          {printMeta.canPrint ? (
            <Link
              href={printHref}
              className="inline-flex items-center justify-center rounded-[24px] border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {printMeta.label}
            </Link>
          ) : null}
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Version History</h3>
          </div>

          <div className="mt-4 space-y-3">
            {historyForms.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No version history yet.
              </div>
            ) : (
              historyForms.map((historyForm, index) => {
                const isCurrent = historyForm.id === form?.id;
                const versionNumber = historyForms.length - index;
                const historyPrintHref =
                  event && historyForm
                    ? getHistoryPrintHref(employeeId, event, historyForm)
                    : null;

                return (
                  <div
                    key={historyForm.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">Version {versionNumber}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDateTime(historyForm.created_at)}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getAdminFormHistoryStatusClasses(
                                historyForm,
                                isCurrent
                              )}`}
                            >
                              {getAdminFormHistoryStatusLabel(historyForm, isCurrent)}
                            </span>
                            {isCurrent ? (
                              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                                Current
                              </span>
                            ) : null}
                          </div>
                        </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          href={href}
                          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          View
                        </Link>

                        {historyPrintHref ? (
                          <Link
                            href={historyPrintHref}
                            className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            Print
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleComplianceCard({
  id,
  title,
  subtitle,
  event,
  actionHref,
}: {
  id: string;
  title: string;
  subtitle: string;
  event?: ComplianceEvent | null;
  actionHref: string;
}) {
  const state = getRequirementState(event, null);
  const actionLabel = event?.id ? "Go" : "Create";

  return (
    <div
      id={id}
      className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>

          <span
            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
              state.tone
            )}`}
          >
            {state.label}
          </span>
        </div>

        <div className="flex justify-end">
          <Link
            href={actionHref}
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {actionLabel}
          </Link>
        </div>

        <div className="grid gap-3 rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Annual Event
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {event?.event_title || "No event created"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Due Date
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {formatDate(event?.due_date)}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Status
            </p>
            <p className="mt-1 text-sm font-medium capitalize text-slate-900">
              {event?.status ? event.status.replaceAll("_", " ") : "No event yet"}
            </p>
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Completed
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {formatDateTime(event?.completed_at)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSection({
  title,
  subtitle,
  children,
  id,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id?: string; employeeId?: string }>;
  searchParams?: Promise<{
    staff_denied?: string;
    inviteOk?: string;
    inviteErr?: string;
    toast?: string;
  }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const employeeId = resolvedParams.employeeId || resolvedParams.id;

  if (!employeeId) {
    return <div className="p-6">Invalid employee ID</div>;
  }

  const staffProfileForActions = await getStaffProfile();
  const canChangeSensitiveEmployeeStatus = isAdminOrHigher(staffProfileForActions);

  async function updateEmployeeStatus(formData: FormData) {
    "use server";

    const nextStatus = String(formData.get("status") || "").toLowerCase().trim();

    if (!["onboarding", "active", "inactive"].includes(nextStatus)) {
      redirect(`/admin/employees/${employeeId}`);
    }

    if (nextStatus === "active" || nextStatus === "inactive") {
      const profile = await getStaffProfile();
      if (!isAdminOrHigher(profile)) {
        redirect(`/admin/employees/${employeeId}?staff_denied=status`);
      }
    }

    if (nextStatus === "active") {
      const { data: employeeForStatus } = await supabase
        .from("applicants")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle();

      if (!employeeForStatus) {
        redirect(`/admin/employees/${employeeId}`);
      }

      const employeeStatusRecord = employeeForStatus as Record<string, unknown>;

      const { data: currentContract } = await supabase
        .from("employee_contracts")
        .select("employment_classification, contract_status, employee_signed_at")
        .eq("applicant_id", employeeId)
        .eq("is_current", true)
        .maybeSingle<{
          employment_classification?: EmployeeContractRow["employment_classification"] | null;
          contract_status?: EmployeeContractRow["contract_status"] | null;
          employee_signed_at?: string | null;
        }>();

      const { data: onboardingStatusForActivation } = await supabase
        .from("onboarding_status")
        .select("application_completed")
        .eq("applicant_id", employeeId)
        .maybeSingle<{ application_completed?: boolean | null }>();

      const { data: employeeTaxFormForActivation } = await supabase
        .from("employee_tax_forms")
        .select("form_status, employee_signed_name, employee_signed_at")
        .eq("applicant_id", employeeId)
        .eq("is_current", true)
        .maybeSingle<{
          form_status?: string | null;
          employee_signed_name?: string | null;
          employee_signed_at?: string | null;
        }>();

      const { data: skillsEventForActivation } = await supabase
        .from("admin_compliance_events")
        .select("id, status, completed_at")
        .eq("applicant_id", employeeId)
        .eq("event_type", "skills_checklist")
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<ComplianceEvent, "id" | "status" | "completed_at">>();

      const requiredCredentialTypes = getRequiredCredentialTypes(
        applicantRolePrimaryForCompliance({
          position: getStringField(employeeStatusRecord, "position"),
          primary_discipline: getStringField(employeeStatusRecord, "primary_discipline"),
          type_of_position: getStringField(employeeStatusRecord, "type_of_position"),
        }),
        currentContract?.employment_classification || null
      );

      const supabaseAuthed = await createServerSupabaseClient();
      const { data: credentialRows } = await supabaseAuthed
        .from("employee_credentials")
        .select("credential_type, expiration_date, uploaded_at, created_at")
        .eq("employee_id", employeeId)
        .order("uploaded_at", { ascending: false })
        .order("created_at", { ascending: false });

      const activationCredentials =
        ((credentialRows || []) as Array<{
          credential_type?: string | null;
          expiration_date?: string | null;
          uploaded_at?: string | null;
          created_at?: string | null;
        }>).map((credential, index) => ({
          id: `activation-${index}`,
          employee_id: employeeId,
          credential_type: String(credential.credential_type || ""),
          credential_name: null,
          credential_number: null,
          issuing_state: null,
          issue_date: null,
          expiration_date: credential.expiration_date || null,
          notes: null,
          uploaded_at: credential.uploaded_at || null,
          created_at: credential.created_at || null,
        })) as CredentialRecord[];
      const latestActivationCredentials = getLatestCredentialsByType(activationCredentials);

      const existingCredentialTypes = new Set(
        latestActivationCredentials.map((credential) =>
          normalizeCredentialTypeKey(String(credential.credential_type || ""))
        )
      );

      const missingCredentialTypes = requiredCredentialTypes.filter(
        (credentialType) => !existingCredentialTypes.has(credentialType)
      );

      const hasExpiredRequiredCredentials = requiredCredentialTypes.some(
        (credentialType) =>
          getRequiredCredentialState(credentialType, latestActivationCredentials).label === "Expired"
      );

      let skillsFormForActivation: Pick<AdminFormRecord, "status"> | null = null;
      if (skillsEventForActivation?.id) {
        const { data: skillsFormRowsForActivation } = await supabase
          .from("employee_admin_forms")
          .select("status")
          .eq("employee_id", employeeId)
          .eq("form_type", "skills_competency")
          .eq("compliance_event_id", skillsEventForActivation.id)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        skillsFormForActivation =
          (skillsFormRowsForActivation?.[0] as Pick<AdminFormRecord, "status"> | null) ?? null;
      }

      const isApplicationCompleteForActivation =
        onboardingStatusForActivation?.application_completed === true;
      const isTaxFormSignedForActivation = Boolean(
        employeeTaxFormForActivation &&
          (employeeTaxFormForActivation.form_status === "completed" ||
            ((employeeTaxFormForActivation.employee_signed_name || "").trim() &&
              employeeTaxFormForActivation.employee_signed_at))
      );
      const isContractSignedForActivation = Boolean(
        currentContract &&
          (currentContract.contract_status === "signed" || currentContract.employee_signed_at)
      );
      const isSkillsCompleteForActivation = isComplianceRequirementComplete(
        skillsEventForActivation || null,
        skillsFormForActivation || null
      );

      if (
        !isApplicationCompleteForActivation ||
        !isTaxFormSignedForActivation ||
        !isContractSignedForActivation ||
        missingCredentialTypes.length > 0 ||
        hasExpiredRequiredCredentials ||
        !isSkillsCompleteForActivation
      ) {
        redirect(`/admin/employees/${employeeId}`);
      }

      const currentStatus = String(employeeStatusRecord.status || "").toLowerCase().trim();

      if (currentStatus !== "active") {
        const activationDate = new Date();
        const annualDueDate = addYears(activationDate, 1);
        const annualDueDateString = formatDateForInsert(annualDueDate);
        const annualDueYear = annualDueDate.getFullYear();

        const annualEventDefinitions = [
          {
            event_type: "annual_training",
            event_title: `Annual Training ${annualDueYear}`,
          },
          {
            event_type: "annual_contract_review",
            event_title: `Contract Review ${annualDueYear}`,
          },
          {
            event_type: "skills_checklist",
            event_title: `Skills Competency ${annualDueYear}`,
          },
          {
            event_type: "annual_performance_evaluation",
            event_title: `Performance Evaluation ${annualDueYear}`,
          },
          {
            event_type: "annual_oig_check",
            event_title: `OIG Check ${annualDueYear}`,
          },
          {
            event_type: "annual_tb_statement",
            event_title: `Annual TB Statement ${annualDueYear}`,
          },
        ] as const;

        const { data: existingAnnualEvents } = await supabase
          .from("admin_compliance_events")
          .select("event_type, due_date")
          .eq("applicant_id", employeeId)
          .in(
            "event_type",
            annualEventDefinitions.map((definition) => definition.event_type)
          );

        const eventsToInsert = annualEventDefinitions.filter((definition) => {
          return !(existingAnnualEvents || []).some((event) => {
            const normalizedEventType = String(event.event_type || "").toLowerCase().trim();
            const dueDateValue = String(event.due_date || "");
            const dueYearMatch = dueDateValue.slice(0, 4) === String(annualDueYear);

            return normalizedEventType === definition.event_type && dueYearMatch;
          });
        });

        if (eventsToInsert.length > 0) {
          const { error: annualEventInsertError } = await supabase
            .from("admin_compliance_events")
            .insert(
              eventsToInsert.map((definition) => ({
                applicant_id: employeeId,
                event_type: definition.event_type,
                event_title: definition.event_title,
                due_date: annualDueDateString,
                status: "pending",
                completed_at: null,
              }))
            );

          if (annualEventInsertError) {
            redirect(`/admin/employees/${employeeId}`);
          }
        }
      }
    }

    const supabaseAudit = await createServerSupabaseClient();
    const { data: priorApplicant } = await supabaseAudit
      .from("applicants")
      .select("status")
      .eq("id", employeeId)
      .maybeSingle();

    const { error: statusUpdateError } = await supabase
      .from("applicants")
      .update({ status: nextStatus })
      .eq("id", employeeId);

    if (!statusUpdateError && employeeId) {
      await insertAuditLog({
        action: "employee_status_change",
        entityType: "applicant",
        entityId: employeeId,
        metadata: {
          previous_status: priorApplicant?.status ?? null,
          new_status: nextStatus,
        },
      });
    }

    redirect(`/admin/employees/${employeeId}`);
  }

  const { data: employee } = await supabase
    .from("applicants")
    .select("*")
    .eq("id", employeeId)
    .single();

  if (!employee) {
    return <div className="p-6">Employee not found</div>;
  }

  const supabaseAuthedForBatch = await createServerSupabaseClient();

  const [
    { data: employeeContractRaw },
    { data: onboardingContractStatus },
    { data: employeeTaxFormRaw },
    { data: onboardingStatus },
    { data: allApplicantFilesRaw },
    { data: documentsRowsRaw },
    { data: onboardingTrainingCompletions },
    { data: trainingProgressRows },
    { data: latestTrainingCompletion },
    { data: exitInterviewRaw },
    { data: skillsEventsRaw },
    { data: skillsFinalizedFormsRows },
    { data: performanceEventsRaw },
    { data: performanceFinalizedFormsRows },
    { data: oigEvent },
    { data: contractReviewEventsRaw },
    { data: contractReviewFinalizedFormsRows },
    { data: trainingChecklistEventsRaw },
    { data: trainingChecklistFinalizedFormsRows },
    { data: tbStatementEventsRaw },
    { data: tbStatementFinalizedFormsRows },
    { data: historyEventsRaw },
    { data: credentials },
    { data: credentialReminderLogRaw },
  ] = await Promise.all([
    supabase
      .from("employee_contracts")
      .select("*")
      .eq("applicant_id", employeeId)
      .eq("is_current", true)
      .single<EmployeeContractRow>(),
    supabase
      .from("onboarding_contracts")
      .select("completed")
      .eq("applicant_id", employeeId)
      .maybeSingle<{ completed?: boolean | null }>(),
    supabase
      .from("employee_tax_forms")
      .select("*")
      .eq("applicant_id", employeeId)
      .eq("is_current", true)
      .maybeSingle<EmployeeTaxFormRow>(),
    supabase
      .from("onboarding_status")
      .select(
        "application_completed, onboarding_invite_status, onboarding_invite_sent_at, onboarding_invite_last_channel, onboarding_flow_status, onboarding_progress_percent, onboarding_started_at, onboarding_completed_at, onboarding_last_activity_at"
      )
      .eq("applicant_id", employeeId)
      .maybeSingle<{
        application_completed?: boolean | null;
        onboarding_invite_status?: string | null;
        onboarding_invite_sent_at?: string | null;
        onboarding_invite_last_channel?: string | null;
        onboarding_flow_status?: string | null;
        onboarding_progress_percent?: number | null;
        onboarding_started_at?: string | null;
        onboarding_completed_at?: string | null;
        onboarding_last_activity_at?: string | null;
      }>(),
    supabaseAdmin
      .from("applicant_files")
      .select("id, applicant_id, document_type, display_name, file_name, file_path, created_at")
      .eq("applicant_id", employeeId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("documents")
      .select("id, applicant_id, document_type, file_url, created_at")
      .eq("applicant_id", employeeId)
      .order("created_at", { ascending: false }),
    supabase.from("onboarding_training_completions").select("id").eq("applicant_id", employeeId),
    supabase.from("applicant_training_progress").select("id, is_complete").eq("applicant_id", employeeId),
    supabase
      .from("employee_training_completions")
      .select("id")
      .eq("applicant_id", employeeId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>(),
    supabaseAdmin
      .from("employee_exit_interviews")
      .select("id, employee_id, reason_for_leaving, separation_type, rehire_eligible, notes, created_at")
      .eq("employee_id", employeeId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .eq("event_type", "skills_checklist")
      .order("due_date", { ascending: false })
      .limit(20),
    supabase
      .from("employee_admin_forms")
      .select("compliance_event_id, finalized_at, created_at")
      .eq("employee_id", employeeId)
      .eq("form_type", "skills_competency")
      .eq("status", "finalized"),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .eq("event_type", "annual_performance_evaluation")
      .order("due_date", { ascending: false })
      .limit(20),
    supabase
      .from("employee_admin_forms")
      .select("compliance_event_id, finalized_at, created_at")
      .eq("employee_id", employeeId)
      .eq("form_type", "performance_evaluation")
      .eq("status", "finalized"),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .eq("event_type", "annual_oig_check")
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle<ComplianceEvent>(),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .in("event_type", ["annual_contract_review", "contract_annual_review"])
      .order("due_date", { ascending: false })
      .limit(20),
    supabase
      .from("employee_admin_forms")
      .select("compliance_event_id, finalized_at, created_at")
      .eq("employee_id", employeeId)
      .eq("form_type", "contract_annual_review")
      .eq("status", "finalized"),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .eq("event_type", "annual_training")
      .order("due_date", { ascending: false })
      .limit(20),
    supabase
      .from("employee_admin_forms")
      .select("compliance_event_id, finalized_at, created_at")
      .eq("employee_id", employeeId)
      .eq("form_type", "annual_training_checklist")
      .eq("status", "finalized"),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .eq("event_type", "annual_tb_statement")
      .order("due_date", { ascending: false })
      .limit(20),
    supabase
      .from("employee_admin_forms")
      .select("compliance_event_id, finalized_at, created_at")
      .eq("employee_id", employeeId)
      .eq("form_type", "annual_tb_statement")
      .eq("status", "finalized"),
    supabase
      .from("admin_compliance_events")
      .select("id, status, event_title, due_date, completed_at, event_type, created_at")
      .eq("applicant_id", employeeId)
      .in("event_type", [
        "skills_checklist",
        "annual_performance_evaluation",
        "annual_oig_check",
        "annual_contract_review",
        "contract_annual_review",
        "annual_training",
        "annual_tb_statement",
      ])
      .order("due_date", { ascending: false }),
    supabaseAuthedForBatch
      .from("employee_credentials")
      .select("*")
      .eq("employee_id", employeeId)
      .order("uploaded_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("employee_credential_reminder_sends")
      .select("id, credential_type, reminder_stage, created_at, expiration_anchor, metadata")
      .eq("applicant_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const employeeContract = employeeContractRaw || null;
  const employeeTaxForm = (employeeTaxFormRaw || null) as EmployeeTaxFormRow | null;

  const allApplicantFileRows = (allApplicantFilesRaw || []) as ApplicantFileRecord[];
  const applicantFiles = allApplicantFileRows;
  const savedSurveyPacketRows = allApplicantFileRows.filter(
    (row) => (row.document_type || "").toLowerCase() === "survey_packet"
  ) as SavedSurveyPacketRecord[];

  const documentsRows = (documentsRowsRaw || []) as DocumentRecord[];

  const exitInterview = (exitInterviewRaw || null) as ExitInterviewRecord | null;

  const [exitInterviewViewUrl, savedSurveyPackets, applicantFilesWithUrls, documentUploadRecords] =
    await Promise.all([
      (async () => {
        if (!exitInterview) return null as string | null;
        const { data: signedUrlData } = await supabaseAdmin.storage
          .from("applicant-files")
          .createSignedUrl(getExitInterviewPdfPath(employeeId), 60 * 60);
        return signedUrlData?.signedUrl || null;
      })(),
      Promise.all(
        savedSurveyPacketRows.map(async (packet) => {
          if (!packet.file_path) {
            return {
              ...packet,
              viewUrl: null,
            };
          }

          const { data: signedUrlData } = await supabaseAdmin.storage
            .from("applicant-files")
            .createSignedUrl(packet.file_path, 60 * 60);

          return {
            ...packet,
            viewUrl: signedUrlData?.signedUrl || null,
          };
        })
      ),
      Promise.all(
        applicantFiles.map(async (file) => {
          if (!file.file_path) {
            return {
              ...file,
              viewUrl: null,
            };
          }

          const { data: signedUrlData } = await supabaseAdmin.storage
            .from("applicant-files")
            .createSignedUrl(file.file_path, 60 * 60);

          return {
            ...file,
            viewUrl: signedUrlData?.signedUrl || null,
          };
        })
      ),
      Promise.all(
        documentsRows.map(async (document) => {
          const storageObject = getStorageObjectFromPublicUrl(document.file_url);
          let viewUrl = document.file_url || null;

          if (storageObject) {
            const { data: signedUrlData } = await supabaseAdmin.storage
              .from(storageObject.bucket)
              .createSignedUrl(storageObject.path, 60 * 60);

            if (signedUrlData?.signedUrl) {
              viewUrl = signedUrlData.signedUrl;
            } else if (storageObject.bucket !== "applicant-files") {
              const { data: fallbackSignedUrlData } = await supabaseAdmin.storage
                .from("applicant-files")
                .createSignedUrl(storageObject.path, 60 * 60);

              viewUrl = fallbackSignedUrlData?.signedUrl || viewUrl;
            }
          }

          return {
            document_type: document.document_type,
            display_name:
              document.document_type === "tb_test"
                ? "TB Test Upload"
                : document.document_type === "fingerprint_clearance_card"
                  ? "AZ Fingerprint Clearance Card"
                  : document.document_type === "drivers_license"
                    ? "Driver's License"
                    : null,
            file_name: null,
            created_at: document.created_at,
            viewUrl,
          } satisfies AdminUploadRecord;
        })
      ),
    ]);

  const adminUploadRecords: AdminUploadRecord[] = [
    ...applicantFilesWithUrls.map((file) => ({
      document_type: file.document_type,
      display_name: file.display_name,
      file_name: file.file_name,
      created_at: file.created_at,
      viewUrl: file.viewUrl,
    })),
    ...documentUploadRecords,
  ];

  const skillsFinalizedAtByEventId = buildFinalizedAtByComplianceEventId(
    skillsFinalizedFormsRows as Array<
      Pick<AdminFormRecord, "compliance_event_id" | "finalized_at" | "created_at">
    >
  );

  const skillsEvent = selectAnnualDisplayEvent(
    (skillsEventsRaw || []) as ComplianceEvent[],
    skillsFinalizedAtByEventId
  );

  const performanceFinalizedAtByEventId = buildFinalizedAtByComplianceEventId(
    performanceFinalizedFormsRows as Array<
      Pick<AdminFormRecord, "compliance_event_id" | "finalized_at" | "created_at">
    >
  );

  const performanceEvent = selectAnnualDisplayEvent(
    (performanceEventsRaw || []) as ComplianceEvent[],
    performanceFinalizedAtByEventId
  );

  const contractReviewFinalizedAtByEventId = buildFinalizedAtByComplianceEventId(
    contractReviewFinalizedFormsRows as Array<
      Pick<AdminFormRecord, "compliance_event_id" | "finalized_at" | "created_at">
    >
  );

  const contractReviewEvent = selectAnnualDisplayEvent(
    (contractReviewEventsRaw || []) as ComplianceEvent[],
    contractReviewFinalizedAtByEventId
  );

  const trainingChecklistFinalizedAtByEventId = buildFinalizedAtByComplianceEventId(
    trainingChecklistFinalizedFormsRows as Array<
      Pick<AdminFormRecord, "compliance_event_id" | "finalized_at" | "created_at">
    >
  );

  const trainingChecklistEvent = selectAnnualDisplayEvent(
    (trainingChecklistEventsRaw || []) as ComplianceEvent[],
    trainingChecklistFinalizedAtByEventId
  );

  const tbStatementFinalizedAtByEventId = buildFinalizedAtByComplianceEventId(
    tbStatementFinalizedFormsRows as Array<
      Pick<AdminFormRecord, "compliance_event_id" | "finalized_at" | "created_at">
    >
  );

  const tbStatementEvent = selectAnnualDisplayEvent(
    (tbStatementEventsRaw || []) as ComplianceEvent[],
    tbStatementFinalizedAtByEventId
  );

  const historyEvents = (historyEventsRaw || []) as ComplianceEvent[];

  const allEmployeeCredentials = (credentials || []) as CredentialRecord[];
  const employeeCredentials = getLatestCredentialsByType(allEmployeeCredentials);

  type CredentialReminderLogRow = {
    id: string;
    credential_type: string;
    reminder_stage: string;
    created_at: string;
    expiration_anchor: string;
    metadata: unknown;
  };
  const credentialReminderLog = (credentialReminderLogRaw || []) as CredentialReminderLogRow[];

  const skillsFormQuery = supabase
    .from("employee_admin_forms")
    .select(
      "id, status, compliance_event_id, finalized_at, created_at, updated_at, form_data, form_type"
    )
    .eq("employee_id", employeeId)
    .eq("form_type", "skills_competency")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const performanceFormQuery = supabase
    .from("employee_admin_forms")
    .select(
      "id, status, compliance_event_id, finalized_at, created_at, updated_at, form_data, form_type"
    )
    .eq("employee_id", employeeId)
    .eq("form_type", "performance_evaluation")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const historyEventIds = historyEvents.map((event) => event.id);

  const [skillsFormRowsResult, performanceFormRowsResult, historyFormsRawRes] = await Promise.all([
    skillsEvent?.id
      ? skillsFormQuery.eq("compliance_event_id", skillsEvent.id)
      : skillsFormQuery.is("compliance_event_id", null),
    performanceEvent?.id
      ? performanceFormQuery.eq("compliance_event_id", performanceEvent.id)
      : performanceFormQuery.is("compliance_event_id", null),
    historyEventIds.length > 0
      ? supabase
          .from("employee_admin_forms")
          .select(
            "id, status, compliance_event_id, finalized_at, created_at, updated_at, form_data, form_type"
          )
          .eq("employee_id", employeeId)
          .in("compliance_event_id", historyEventIds)
          .in("form_type", ["skills_competency", "performance_evaluation"])
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as AdminFormRecord[] | null }),
  ]);

  const { data: skillsFormRows } = skillsFormRowsResult;
  const { data: performanceFormRows } = performanceFormRowsResult;
  const { data: historyFormsRaw } = historyFormsRawRes;
  const historyForms = (historyFormsRaw ?? []) as AdminFormRecord[];

  const skillsForm = (skillsFormRows?.[0] as AdminFormRecord | null) ?? null;
  const performanceForm =
    (performanceFormRows?.[0] as AdminFormRecord | null) ?? null;
  const skillsProgress = getProgressSummary("skills_competency", skillsForm);
  const performanceProgress = getProgressSummary(
    "performance_evaluation",
    performanceForm
  );

  const skillsHref = skillsEvent?.id
    ? `/admin/employees/${employeeId}/forms/skills-competency?eventId=${skillsEvent.id}`
    : `/admin/employees/${employeeId}/forms/skills-competency`;

  const performanceHref = performanceEvent?.id
    ? `/admin/employees/${employeeId}/forms/performance-evaluation?eventId=${performanceEvent.id}`
    : `/admin/employees/${employeeId}/forms/performance-evaluation`;

  const skillsPrintHref = skillsEvent?.id
    ? `/admin/employees/${employeeId}/forms/skills-competency/print?eventId=${skillsEvent.id}`
    : `/admin/employees/${employeeId}/forms/skills-competency/print`;

  const performancePrintHref = performanceEvent?.id
    ? `/admin/employees/${employeeId}/forms/performance-evaluation/print?eventId=${performanceEvent.id}`
    : `/admin/employees/${employeeId}/forms/performance-evaluation/print`;

  const oigHref = `/admin/employees/${employeeId}#oig-section`;
  const contractHref = contractReviewEvent?.id
    ? `/admin/employees/${employeeId}/forms/contract-annual-review?eventId=${contractReviewEvent.id}`
    : `/admin/employees/${employeeId}/forms/contract-annual-review`;
  const trainingHref = trainingChecklistEvent?.id
    ? `/admin/employees/${employeeId}/forms/annual-training-checklist?eventId=${trainingChecklistEvent.id}`
    : `/admin/employees/${employeeId}/forms/annual-training-checklist`;
  const tbHref = tbStatementEvent?.id
    ? `/admin/employees/${employeeId}/forms/annual-tb-statement?eventId=${tbStatementEvent.id}`
    : `/admin/employees/${employeeId}/forms/annual-tb-statement`;
  const contractPdfHref = employeeContract
    ? `/admin/employees/${employeeId}/employee-file?document=employment_contract`
    : null;
  const taxFormPdfHref = employeeTaxForm
    ? `/admin/employees/${employeeId}/employee-file?document=tax`
    : null;
  const hasTrainingCertificateArtifact =
    Boolean(latestTrainingCompletion) ||
    (onboardingTrainingCompletions?.length || 0) > 0 ||
    (trainingProgressRows || []).some((row) => row.is_complete);
  const trainingCertificateHref = hasTrainingCertificateArtifact
    ? `/admin/employees/${employeeId}/employee-file?document=training`
    : null;
  const applicationViewHref = `/admin/employees/${employeeId}/employee-file?document=application`;
  const surveyPacketZipHref = `/api/generate-onboarding-pdf?applicantId=${employeeId}`;
  const surveyPacketZipFileName = `saintly-onboarding-${employeeId}.zip`;

  const employeePageBase = `/admin/employees/${employeeId}`;

  const latestOigProof = getLatestApplicantFile(adminUploadRecords, "oig_check");
  const latestBackgroundCheckProof = getLatestApplicantFile(adminUploadRecords, "background_check");
  const latestTbTestProof = getLatestApplicantFile(adminUploadRecords, "tb_test");
  const latestCprProof = getLatestApplicantFile(adminUploadRecords, "cpr_front");
  const latestDriversLicenseProof = getLatestApplicantFile(adminUploadRecords, "drivers_license");
  const latestAutoInsuranceProof = getLatestApplicantFile(adminUploadRecords, "auto_insurance");
  const latestAutoInsuranceProofNormalized =
    latestAutoInsuranceProof ||
    adminUploadRecords.find(
      (file) => normalizeCredentialTypeKey(file.document_type) === "auto_insurance"
    ) ||
    null;
  const latestIndependentContractorInsuranceProof = getLatestApplicantFile(
    adminUploadRecords,
    "independent_contractor_insurance"
  );
  const latestFingerprintProof = getLatestApplicantFile(
    adminUploadRecords,
    "fingerprint_clearance_card"
  );

  const uploadedDocumentTypes = new Set(
    [
      ...(documentsRows || []).map((document) =>
        normalizeDocumentTypeLookupKey(
          String(
            (document as {
              document_type?: string | null;
            }).document_type || ""
          )
        )
      ),
      ...applicantFiles.map((file) => normalizeDocumentTypeLookupKey(String(file.document_type || ""))),
    ].filter(Boolean)
  );
  const hasFingerprintUpload =
    uploadedDocumentTypes.has("fingerprint_clearance_card") || !!latestFingerprintProof;

  const oigProofHistory = adminUploadRecords
    .filter(
      (file) => (file.document_type || "").toLowerCase().trim() === "oig_check"
    )
    .slice()
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

  const backgroundCheckHistory = adminUploadRecords
    .filter(
      (file) =>
        (file.document_type || "").toLowerCase().trim() === "background_check"
    )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

  const fingerprintCardHistory = adminUploadRecords
    .filter(
      (file) =>
        (file.document_type || "").toLowerCase().trim() ===
        "fingerprint_clearance_card"
    )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

  const tbTestHistory = adminUploadRecords
    .filter(
      (file) => (file.document_type || "").toLowerCase().trim() === "tb_test"
    )
    .slice()
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

  const oigProofHistoryPreview = oigProofHistory.slice(0, 2);
  const backgroundCheckHistoryPreview = backgroundCheckHistory.slice(0, 2);
  const fingerprintCardHistoryPreview = fingerprintCardHistory.slice(0, 2);
  const tbTestHistoryPreview = tbTestHistory.slice(0, 2);

  const effectiveOigEvent =
    latestOigProof && oigEvent
      ? {
          ...oigEvent,
          status: "completed",
          completed_at: oigEvent.completed_at || latestOigProof.created_at || null,
        }
      : oigEvent;

  const skillsState = getRequirementState(skillsEvent, skillsForm);
  const performanceState = getRequirementState(performanceEvent, performanceForm);
  const oigState = getRequirementState(effectiveOigEvent, null);
  const contractState = getRequirementState(contractReviewEvent, null);
  const trainingState = getRequirementState(trainingChecklistEvent, null);
  const tbState = getRequirementState(tbStatementEvent, null);

  const skillsPrintMeta = getPrintMeta(skillsForm, skillsEvent);
  const performancePrintMeta = getPrintMeta(performanceForm, performanceEvent);

  const credentialSummary = {
    active: employeeCredentials.filter(
      (credential) => getCredentialStatus(credential.expiration_date).label === "Active"
    ).length,
    dueSoon: employeeCredentials.filter(
      (credential) => getCredentialStatus(credential.expiration_date).label === "Due Soon"
    ).length,
    expired: employeeCredentials.filter(
      (credential) => getCredentialStatus(credential.expiration_date).label === "Expired"
    ).length,
  };

  const employeeRecord = employee as Record<string, unknown>;

  const roleCandidates = [
    { source: "position", value: getStringField(employeeRecord, "position") },
    { source: "primary_discipline", value: getStringField(employeeRecord, "primary_discipline") },
    { source: "type_of_position", value: getStringField(employeeRecord, "type_of_position") },
  ].filter(
    (candidate): candidate is { source: string; value: string } =>
      typeof candidate.value === "string" && candidate.value.trim().length > 0
  );

  const suggestedContractRole =
    roleCandidates
      .map((candidate) => inferContractRoleFromText(candidate.value))
      .find((value): value is NonNullable<typeof value> => Boolean(value)) || "";

  const contractEmploymentClassification =
    employeeContract?.employment_classification || null;
  const taxFormEmploymentClassification =
    employeeTaxForm?.employment_classification || null;
  const effectiveEmploymentClassification =
    contractEmploymentClassification || taxFormEmploymentClassification || null;

  const requiredCredentialTypes = getRequiredCredentialTypes(
    applicantRolePrimaryForCompliance(employeeRecord as ApplicantRoleFields),
    effectiveEmploymentClassification
  );

  const requiredCredentialStatuses = requiredCredentialTypes.map((credentialType) => ({
    credentialType,
    status: getRequiredCredentialState(credentialType, employeeCredentials),
  }));
  const requiredCredentialReminderStatuses = requiredCredentialTypes.map((credentialType) => {
    const status = getRequiredCredentialState(credentialType, employeeCredentials);

    return {
      credentialType,
      status: status.credential
        ? getCredentialReminderStatus(status.credential.expiration_date)
        : {
            label: "Missing" as const,
            tone: "red" as const,
            badgeClass: "border border-red-200 bg-red-50 text-red-700",
          },
      credential: status.credential,
    };
  });

  const existingCredentialTypes = new Set(
    employeeCredentials.map((credential) =>
      normalizeCredentialTypeKey(credential.credential_type)
    )
  );

  const missingCredentialTypes = requiredCredentialTypes.filter((credentialType) => {
    if (existingCredentialTypes.has(credentialType)) return false;
    if (credentialType === "cpr" && uploadedDocumentTypes.has("cpr_front")) return false;
    if (
      credentialType === "auto_insurance" &&
      (uploadedDocumentTypes.has("auto_insurance") || !!latestAutoInsuranceProofNormalized)
    ) {
      return false;
    }
    if (
      credentialType === "independent_contractor_insurance" &&
      (uploadedDocumentTypes.has("independent_contractor_insurance") ||
        !!latestIndependentContractorInsuranceProof)
    ) {
      return false;
    }
    if (
      credentialType === "fingerprint_clearance_card" &&
      hasFingerprintUpload
    ) {
      return false;
    }
    return true;
  });
  const requiredOnboardingDocumentTypes = [
    "resume",
    "drivers_license",
    "fingerprint_clearance_card",
    "social_security_card",
    "cpr_front",
    "tb_test",
  ];
  const hasRequiredOnboardingDocuments = requiredOnboardingDocumentTypes.every((documentType) =>
    uploadedDocumentTypes.has(documentType)
  );

  const isApplicationComplete = onboardingStatus?.application_completed === true;
  const isDocumentsComplete =
    (applicantFiles?.length || 0) > 0 || hasRequiredOnboardingDocuments;
  const isTaxFormSigned = Boolean(
    employeeTaxForm &&
      (employeeTaxForm.form_status === "completed" ||
        ((employeeTaxForm.employee_signed_name || "").trim() &&
          employeeTaxForm.employee_signed_at))
  );
  const isContractsComplete = Boolean(onboardingContractStatus?.completed && isTaxFormSigned);
  const isTrainingComplete = Boolean(
    (onboardingTrainingCompletions?.length || 0) > 0 ||
      (trainingProgressRows || []).some((row) => row.is_complete)
  );
  const isSkillsComplete = isComplianceRequirementComplete(skillsEvent, skillsForm);
  const isPerformanceComplete = isComplianceRequirementComplete(
    performanceEvent,
    performanceForm
  );
  const hasTbDocumentation = uploadedDocumentTypes.has("tb_test") || !!latestTbTestProof;
  const isOigComplete = isComplianceRequirementComplete(effectiveOigEvent, null);
  const hasBackgroundCheck = uploadedDocumentTypes.has("background_check");
  const requiresCpr = requiredCredentialTypes.includes("cpr");
  const requiresDriversLicense = requiredCredentialTypes.includes("drivers_license");
  const requiresAutoInsurance = requiredCredentialTypes.includes("auto_insurance");
  const requiresIndependentContractorInsurance = requiredCredentialTypes.includes(
    "independent_contractor_insurance"
  );
  const requiresFingerprintCard = requiredCredentialTypes.includes(
    "fingerprint_clearance_card"
  );
  const hasCprCard =
    !requiresCpr ||
    existingCredentialTypes.has("cpr") ||
    uploadedDocumentTypes.has("cpr_front");
  const hasDriversLicense =
    !requiresDriversLicense || existingCredentialTypes.has("drivers_license");
  const hasAutoInsurance =
    !requiresAutoInsurance ||
    existingCredentialTypes.has("auto_insurance") ||
    uploadedDocumentTypes.has("auto_insurance") ||
    !!latestAutoInsuranceProofNormalized;
  const hasIndependentContractorInsurance =
    !requiresIndependentContractorInsurance ||
    existingCredentialTypes.has("independent_contractor_insurance") ||
    uploadedDocumentTypes.has("independent_contractor_insurance") ||
    !!latestIndependentContractorInsuranceProof;
  const hasFingerprintCard =
    !requiresFingerprintCard ||
    existingCredentialTypes.has("fingerprint_clearance_card") ||
    hasFingerprintUpload;
  const isContractSetupComplete = Boolean(employeeContract);
  const isContractSigned = Boolean(
    employeeContract &&
      (employeeContract.contract_status === "signed" || employeeContract.employee_signed_at)
  );
  const hasExpiredRequiredCredentials = requiredCredentialStatuses.some(
    ({ status }) => status.label === "Expired"
  );
  const expiredRequiredCredentialTypes = requiredCredentialStatuses
    .filter(({ status }) => status.label === "Expired")
    .map(({ credentialType }) => formatCredentialType(credentialType));
  const overdueRequiredCredentialCount = requiredCredentialReminderStatuses.filter(
    ({ status }) => status.label === "Overdue"
  ).length;
  const urgentRequiredCredentialCount = requiredCredentialReminderStatuses.filter(
    ({ status }) => status.label === "Urgent"
  ).length;
  const dueSoonRequiredCredentialCount = requiredCredentialReminderStatuses.filter(
    ({ status }) => status.label === "Due Soon"
  ).length;
  const annualReminderItems = [
    {
      label: "Skills Competency",
      href: skillsHref,
      status: getAnnualReminderStatus(skillsEvent),
    },
    {
      label: "Performance Evaluation",
      href: performanceHref,
      status: getAnnualReminderStatus(performanceEvent),
    },
    {
      label: "OIG Check",
      href: oigHref,
      status: getAnnualReminderStatus(effectiveOigEvent),
    },
    {
      label: "Contract Review",
      href: contractHref,
      status: getAnnualReminderStatus(contractReviewEvent),
    },
    {
      label: "Annual Training",
      href: trainingHref,
      status: getAnnualReminderStatus(trainingChecklistEvent),
    },
    {
      label: "TB Statement",
      href: tbHref,
      status: getAnnualReminderStatus(tbStatementEvent),
    },
  ];
  const actionableReminderItems = [
    ...annualReminderItems
      .filter((item) => item.status && item.status.label !== "Pending")
      .map((item) => ({
        label: item.label,
        href: item.href,
        status: item.status!,
      })),
    ...requiredCredentialReminderStatuses
      .filter(
        ({ status }) =>
          status.label === "Overdue" || status.label === "Urgent" || status.label === "Due Soon"
      )
      .map(({ credentialType, status }) => ({
        label: formatCredentialType(credentialType),
        href: `#expiring-credentials-section`,
        status,
      })),
  ];
  const isHireSetupReady =
    isApplicationComplete &&
    isTaxFormSigned &&
    isContractSigned &&
    isSkillsComplete &&
    missingCredentialTypes.length === 0 &&
    !hasExpiredRequiredCredentials;

  const activationBlockingReasons = [
    !isApplicationComplete ? "Onboarding is not complete" : null,
    !isTaxFormSigned ? "Tax form is not signed" : null,
    !isContractSigned ? "Contract is not signed" : null,
    missingCredentialTypes.length > 0
      ? `Missing credentials: ${missingCredentialTypes.map(formatCredentialType).join(", ")}`
      : null,
    hasExpiredRequiredCredentials
      ? `Expired credentials: ${expiredRequiredCredentialTypes.join(", ")}`
      : null,
    !isSkillsComplete ? "Skills competency is not completed" : null,
  ].filter((reason): reason is string => Boolean(reason));

  const missingSurveyItems = [
    !isApplicationComplete ? "Application" : null,
    !isDocumentsComplete ? "Documents" : null,
    !isContractsComplete ? "Contracts" : null,
    !isTrainingComplete ? "Training" : null,
    !isSkillsComplete ? "Skills Competency" : null,
    !isPerformanceComplete ? "Performance Evaluation" : null,
    !hasTbDocumentation ? "TB Test" : null,
    !isOigComplete ? "OIG" : null,
    !hasBackgroundCheck ? "Background Check" : null,
    !isTaxFormSigned ? "Tax Form" : null,
    !hasCprCard ? "CPR Card" : null,
    !hasDriversLicense ? "Driver’s License" : null,
    !hasFingerprintCard ? "AZ Fingerprint Clearance Card" : null,
  ].filter((item): item is string => Boolean(item));

  const isSurveyReady = missingSurveyItems.length === 0;

  const hasSomeDocumentUpload =
    ((applicantFiles?.length || 0) > 0 || (documentsRows?.length || 0) > 0) && !isDocumentsComplete;
  const hasTrainingProgressButNotComplete =
    (trainingProgressRows?.length || 0) > 0 && !isTrainingComplete;
  const skillsFormIsDraft = skillsForm?.status === "draft";
  const missingCredentialDisplayNames = missingCredentialTypes.map((t) => formatCredentialType(t));

  /* Pure sync derive from loaded rows — runs once per request (server), not per React render. */
  const onboardingCommandSnapshot = buildUnifiedOnboardingState({
    applicantId: employeeId,
    employeePageBase,
    onboardingStatus: onboardingStatus ?? null,
    isApplicationComplete,
    isDocumentsComplete,
    isContractsComplete,
    isTaxFormSigned,
    isTrainingComplete,
    hasSomeDocumentUpload,
    hasTrainingProgressButNotComplete,
    onboardingContractCompleted: Boolean(onboardingContractStatus?.completed),
    isSkillsComplete,
    isPerformanceComplete,
    hasTbDocumentation,
    isOigComplete,
    hasBackgroundCheck,
    hasCprCard,
    hasDriversLicense,
    hasFingerprintCard,
    requiresCpr,
    requiresDriversLicense,
    requiresFingerprintCard,
    missingCredentialDisplayNames,
    skillsFormIsDraft,
    isSurveyReady,
  });

  const surveyMissingSummary =
    missingSurveyItems.length > 4
      ? `${missingSurveyItems.slice(0, 4).join(", ")} +${missingSurveyItems.length - 4} more`
      : missingSurveyItems.join(", ");

  const employeeStatusMeta = getEmployeeStatusMeta(
    typeof employee.status === "string" ? employee.status : null
  );

  const complianceSummary = [
    {
      label: "Skills Competency",
      value: skillsState.label,
      tone: skillsState.tone,
      progress:
        skillsProgress.total > 0
          ? `${skillsProgress.percent}% complete`
          : "No progress yet",
      sectionHref: `${employeePageBase}#skills-section`,
      printHref: skillsPrintHref,
      printLabel: skillsPrintMeta.label,
      showPrint: skillsPrintMeta.canPrint,
      viewHref: null as string | null,
      showView: false,
    },
    {
      label: "Performance Evaluation",
      value: performanceState.label,
      tone: performanceState.tone,
      progress:
        performanceProgress.total > 0
          ? `${performanceProgress.percent}% complete`
          : "No progress yet",
      sectionHref: `${employeePageBase}#performance-section`,
      printHref: performancePrintHref,
      printLabel: performancePrintMeta.label,
      showPrint: performancePrintMeta.canPrint,
      viewHref: null as string | null,
      showView: false,
    },
    {
      label: "OIG Check",
      value: oigState.label,
      tone: oigState.tone,
      progress: effectiveOigEvent?.completed_at
        ? `Completed ${formatDate(effectiveOigEvent.completed_at)}`
        : effectiveOigEvent?.due_date
          ? `Due ${formatDate(effectiveOigEvent.due_date)}`
          : "No event yet",
      sectionHref: `${employeePageBase}#oig-section`,
      printHref: "",
      printLabel: "",
      showPrint: false,
      viewHref: (latestOigProof as AdminUploadRecord | null)?.viewUrl || null,
      showView: Boolean(
        isOigComplete && (latestOigProof as AdminUploadRecord | null)?.viewUrl
      ),
    },
    {
      label: "Contract Review",
      value: contractState.label,
      tone: contractState.tone,
      progress: contractReviewEvent?.due_date
        ? `Due ${formatDate(contractReviewEvent.due_date)}`
        : "No event yet",
      sectionHref: `${employeePageBase}#contract-review-section`,
      printHref: "",
      printLabel: "",
      showPrint: false,
      viewHref: null as string | null,
      showView: false,
    },
    {
      label: "Annual Training",
      value: trainingState.label,
      tone: trainingState.tone,
      progress: trainingChecklistEvent?.due_date
        ? `Due ${formatDate(trainingChecklistEvent.due_date)}`
        : "No event yet",
      sectionHref: `${employeePageBase}#training-checklist-section`,
      printHref: "",
      printLabel: "",
      showPrint: false,
      viewHref: null as string | null,
      showView: false,
    },
    {
      label: "Annual TB Statement",
      value: tbState.label,
      tone: tbState.tone,
      progress: tbStatementEvent?.due_date
        ? `Due ${formatDate(tbStatementEvent.due_date)}`
        : "No event yet",
      sectionHref: `${employeePageBase}#tb-statement-section`,
      printHref: "",
      printLabel: "",
      showPrint: false,
      viewHref: null as string | null,
      showView: false,
    },
  ];

  const onboardingStatusItems = [
    {
      label: "Employee Portal",
      detail: isApplicationComplete
        ? "Application marked complete in onboarding."
        : "Employee still needs to finish the portal application.",
      status: isApplicationComplete ? "Complete" : "In Progress",
    },
    {
      label: "Application",
      detail: isApplicationComplete
        ? "Core onboarding application is on file."
        : "Application details are still incomplete.",
      status: isApplicationComplete ? "Complete" : "Missing",
    },
    {
      label: "Contracts",
      detail: isContractsComplete
        ? "Onboarding contracts and signed tax form are complete."
        : "Contracts or signatures still need to be collected.",
      status: isContractsComplete ? "Complete" : "Missing",
    },
    {
      label: "Documents",
      detail: isDocumentsComplete
        ? "Required onboarding documents are available."
        : "Resume, ID, CPR, TB, SS card, or fingerprint card still need upload.",
      status: isDocumentsComplete ? "Complete" : "Missing",
    },
    {
      label: "Training",
      detail: isTrainingComplete
        ? "Onboarding training completion is on file."
        : "Training still needs to be completed or recorded.",
      status: isTrainingComplete ? "Complete" : "Missing",
    },
  ] as const;

  const hireSetupItems = [
    {
      label: "Tax Form",
      detail: isTaxFormSigned
        ? "Current tax form is signed and stored."
        : "Tax form still needs completion or signature.",
      status: isTaxFormSigned ? "Complete" : "Missing",
    },
    {
      label: "Contract Setup",
      detail: isContractSetupComplete
        ? "Current employee contract is set up."
        : "Employee contract setup still needs attention.",
      status: isContractSetupComplete ? "Complete" : "Missing",
    },
    {
      label: "Skills Competency",
      detail: isSkillsComplete
        ? "Current skills competency requirement is complete."
        : "Skills competency still needs to be started or finalized.",
      status: isSkillsComplete
        ? "Complete"
        : skillsForm?.status === "draft"
          ? "In Progress"
          : "Missing",
    },
    {
      label: "Activation Readiness",
      detail: isHireSetupReady
        ? "Hire setup is ready for activation."
        : missingCredentialTypes.length > 0
          ? `Still missing ${missingCredentialTypes.map(formatCredentialType).join(", ")}.`
          : "One or more hire setup steps still need review.",
      status: isHireSetupReady ? "Complete" : "Missing",
    },
  ] as const;

  const personnelFileAuditItems = [
    {
      label: "Application",
      status: isApplicationComplete ? "Complete" : "Missing",
      sectionHref: "",
      showGo: false,
      artifactHref: isApplicationComplete
        ? appendEmployeeFileInlineView(applicationViewHref)
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "Documents",
      status: isDocumentsComplete ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#background-section`,
    },
    {
      label: "Contracts",
      status: isContractsComplete ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#hire-setup-section`,
      artifactHref:
        isContractsComplete && contractPdfHref
          ? appendEmployeeFileInlineView(contractPdfHref)
          : null,
      artifactLabel: "View",
      artifactExternal: false,
    },
    {
      label: "Training",
      status: isTrainingComplete ? "Complete" : "Missing",
      sectionHref: "",
      showGo: false,
      artifactHref: trainingCertificateHref
        ? appendEmployeeFileInlineView(trainingCertificateHref)
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "Skills Competency",
      status: isSkillsComplete ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#skills-section`,
      artifactHref:
        isSkillsComplete && skillsPrintMeta.canPrint ? skillsPrintHref : null,
      artifactLabel: "View",
      artifactExternal: false,
    },
    {
      label: "Performance Evaluation",
      status: isPerformanceComplete ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#performance-section`,
      artifactHref:
        isPerformanceComplete && performancePrintMeta.canPrint
          ? performancePrintHref
          : null,
      artifactLabel: "View",
      artifactExternal: false,
    },
    {
      label: "TB",
      status: hasTbDocumentation ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#tb-section`,
      artifactHref: hasTbDocumentation
        ? (latestTbTestProof as AdminUploadRecord | null)?.viewUrl ?? null
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "OIG",
      status: isOigComplete ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#oig-proof-section`,
      artifactHref: isOigComplete
        ? (latestOigProof as AdminUploadRecord | null)?.viewUrl ?? null
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "Background Check",
      status: hasBackgroundCheck ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#background-section`,
      artifactHref: hasBackgroundCheck
        ? (latestBackgroundCheckProof as AdminUploadRecord | null)?.viewUrl ?? null
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "Tax Form",
      status: isTaxFormSigned ? "Complete" : "Missing",
      sectionHref: `${employeePageBase}#tax-forms-section`,
      artifactHref:
        isTaxFormSigned && taxFormPdfHref
          ? appendEmployeeFileInlineView(taxFormPdfHref)
          : null,
      artifactLabel: "View",
      artifactExternal: false,
    },
    {
      label: "CPR Card",
      status: requiresCpr ? (hasCprCard ? "Complete" : "Missing") : "Not Required",
      sectionHref: `${employeePageBase}#cpr-section`,
      artifactHref: requiresCpr
        ? (latestCprProof as AdminUploadRecord | null)?.viewUrl ?? null
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "Driver’s License",
      status: requiresDriversLicense
        ? hasDriversLicense
          ? "Complete"
          : "Missing"
        : "Not Required",
      sectionHref: `${employeePageBase}#drivers-license-section`,
      artifactHref: requiresDriversLicense
        ? (latestDriversLicenseProof as AdminUploadRecord | null)?.viewUrl ?? null
        : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    {
      label: "AZ Fingerprint Clearance Card",
      status: requiresFingerprintCard
        ? hasFingerprintCard
          ? "Complete"
          : "Missing"
        : "Not Required",
      sectionHref: `${employeePageBase}#fingerprint-section`,
      artifactHref:
        requiresFingerprintCard && hasFingerprintCard
          ? (latestFingerprintProof as AdminUploadRecord | null)?.viewUrl ?? null
          : null,
      artifactLabel: "View",
      artifactExternal: true,
    },
    ...(requiresAutoInsurance
      ? [
          {
            label: "Auto Insurance",
            status: hasAutoInsurance ? "Complete" : "Missing",
            sectionHref: `${employeePageBase}#auto_insurance-section`,
            artifactHref: hasAutoInsurance
              ? (latestAutoInsuranceProofNormalized as AdminUploadRecord | null)?.viewUrl ?? null
              : null,
            artifactLabel: "View",
            artifactExternal: true,
          },
        ]
      : []),
    ...(requiresIndependentContractorInsurance
      ? [
          {
            label: "Independent Contractor Insurance",
            status: hasIndependentContractorInsurance ? "Complete" : "Missing",
            sectionHref: `${employeePageBase}#independent_contractor_insurance-section`,
            artifactHref: hasIndependentContractorInsurance
              ? (latestIndependentContractorInsuranceProof as AdminUploadRecord | null)?.viewUrl ??
                null
              : null,
            artifactLabel: "View",
            artifactExternal: true,
          },
        ]
      : []),
  ];

  const personnelFileAuditForDeferred: PersonnelFileAuditItem[] = personnelFileAuditItems.map(
    (item) => ({
      label: item.label,
      status: item.status,
      sectionHref: item.sectionHref,
      showGo: "showGo" in item ? item.showGo : undefined,
      artifactHref: "artifactHref" in item && item.artifactHref ? item.artifactHref : null,
      artifactLabel: "artifactLabel" in item ? item.artifactLabel : "View",
      artifactExternal: "artifactExternal" in item ? item.artifactExternal : false,
      statusTone:
        item.status === "Complete"
          ? "green"
          : item.status === "Missing"
            ? "red"
            : "slate",
    })
  );

  const documentsComplianceInitialHiring: InitialHiringRowDef[] = [
    {
      key: "oig",
      label: "OIG exclusion proof",
      statusLabel: isOigComplete ? "Complete" : "Missing",
      statusTone: isOigComplete ? "green" : "red",
      lastUpdatedDisplay: latestOigProof?.created_at ? formatDateTime(latestOigProof.created_at) : "—",
      viewUrl: (latestOigProof as AdminUploadRecord | null)?.viewUrl ?? null,
      documentType: "oig_check",
      uploadLabel: "OIG Check Proof",
      completeComplianceEventId: oigEvent?.id,
      anchorId: "oig-proof-section",
      history: buildAdminUploadHistoryDisplay(oigProofHistory),
      workflowOpenHref: `${employeePageBase}#oig-section`,
    },
    {
      key: "background",
      label: "Background check",
      statusLabel: hasBackgroundCheck ? "Complete" : "Missing",
      statusTone: hasBackgroundCheck ? "green" : "red",
      lastUpdatedDisplay: latestBackgroundCheckProof?.created_at
        ? formatDateTime(latestBackgroundCheckProof.created_at)
        : "—",
      viewUrl: (latestBackgroundCheckProof as AdminUploadRecord | null)?.viewUrl ?? null,
      documentType: "background_check",
      uploadLabel: "Background Check",
      anchorId: "background-section",
      history: buildAdminUploadHistoryDisplay(backgroundCheckHistory),
    },
    {
      key: "fingerprint",
      label: "AZ Fingerprint Clearance Card (file)",
      statusLabel: hasFingerprintUpload ? "On file" : "Missing",
      statusTone: hasFingerprintUpload ? "green" : "red",
      lastUpdatedDisplay: latestFingerprintProof?.created_at
        ? formatDateTime(latestFingerprintProof.created_at)
        : "—",
      viewUrl: (latestFingerprintProof as AdminUploadRecord | null)?.viewUrl ?? null,
      documentType: "fingerprint_clearance_card",
      uploadLabel: "AZ Fingerprint Clearance Card",
      anchorId: "fingerprint-section",
      history: buildAdminUploadHistoryDisplay(fingerprintCardHistory),
      workflowOpenHref: `${employeePageBase}#credentials-section`,
    },
    {
      key: "tb",
      label: "TB test / documentation (upload)",
      statusLabel: hasTbDocumentation ? "On file" : "Missing",
      statusTone: hasTbDocumentation ? "green" : "red",
      lastUpdatedDisplay: latestTbTestProof?.created_at
        ? formatDateTime(latestTbTestProof.created_at)
        : "—",
      viewUrl: (latestTbTestProof as AdminUploadRecord | null)?.viewUrl ?? null,
      documentType: "tb_test",
      uploadLabel: "TB Test Upload",
      anchorId: "tb-section",
      history: buildAdminUploadHistoryDisplay(tbTestHistory),
      workflowOpenHref: `${employeePageBase}#tb-statement-section`,
    },
  ];

  const documentsComplianceOngoing: OngoingComplianceRowDef[] = complianceSummary.map((item, i) => ({
    key: `ongoing-${i}-${item.label}`,
    label: item.label,
    statusLabel: item.value,
    statusTone: item.tone,
    nextDueDisplay: item.progress,
    sectionHref: item.sectionHref,
  }));

  const documentsComplianceExpiring: ExpiringCredentialRowDef[] = getLatestCredentialsByType(
    allEmployeeCredentials
  )
    .map((c) => {
      const st = getCredentialStatus(c.expiration_date);
      const statusLabel: ExpiringCredentialRowDef["statusLabel"] =
        st.label === "Expired"
          ? "Expired"
          : st.label === "Due Soon"
            ? "Expiring"
            : st.label === "Active"
              ? "Valid"
              : "Unknown";
      return {
        key: c.id,
        label: formatCredentialType(c.credential_type),
        statusLabel,
        statusTone: st.tone,
        expirationDisplay: c.expiration_date ? formatDate(c.expiration_date) : "—",
        anchorId: getCredentialAnchorId(c.credential_type),
      };
    })
    .sort((a, b) => a.expirationDisplay.localeCompare(b.expirationDisplay));

  const skillsHistoryForms = historyForms.filter(
    (historyForm) =>
      historyForm.form_type === "skills_competency" &&
      historyForm.compliance_event_id === skillsEvent?.id
  );

  const performanceHistoryForms = historyForms.filter(
    (historyForm) =>
      historyForm.form_type === "performance_evaluation" &&
      historyForm.compliance_event_id === performanceEvent?.id
  );

  const skillsHistoryFormsPreview = skillsHistoryForms.slice(0, 3);
  const performanceHistoryFormsPreview = performanceHistoryForms.slice(0, 3);

  const historyRows: ComplianceHistoryRow[] = historyEvents.flatMap(
    (event): ComplianceHistoryRow[] => {
      const matchingForms = historyForms.filter(
        (form) => form.compliance_event_id === event.id
      );

      if (matchingForms.length === 0) {
        return [
          {
            event,
            form: null,
            printMeta: getPrintMeta(null, event),
            printHref: getHistoryPrintHref(employeeId, event, null),
          },
        ];
      }

      return matchingForms.map((form) => ({
        event,
        form,
        printMeta: getPrintMeta(form, event),
        printHref: getHistoryPrintHref(employeeId, event, form),
      }));
    }
  );

  const statusChangeDeniedMessage =
    resolvedSearchParams?.staff_denied === "status"
      ? "You do not have permission to set Active or Inactive status. Ask an admin or super admin."
      : null;

  const inviteOkFlag = resolvedSearchParams?.inviteOk;
  const inviteErrFlag = resolvedSearchParams?.inviteErr;
  const toastParam =
    resolvedSearchParams && typeof resolvedSearchParams.toast === "string"
      ? resolvedSearchParams.toast.trim()
      : "";
  const employeeIsInactive = String(employee.status || "").toLowerCase() === "inactive";

  const displayName =
    `${employee.first_name || ""} ${employee.last_name || ""}`.trim() || "Employee";
  const roleTitleParts = [
    employeeContract?.role_label?.trim(),
    typeof employee.position === "string" ? employee.position.trim() : "",
    typeof employee.primary_discipline === "string" ? employee.primary_discipline.trim() : "",
  ].filter((s): s is string => Boolean(s));
  const roleLine = roleTitleParts.length > 0 ? roleTitleParts.join(" · ") : "—";
  const phoneDisplay =
    typeof employee.phone === "string" && employee.phone.trim() ? employee.phone.trim() : null;
  const hireEffective = employeeContract?.effective_date;
  const hireDateDisplay = hireEffective ? formatDate(hireEffective) : "—";
  const hireDateLabel = "Contract start";
  const onboardingSummaryLine = `Onboarding ${Math.round(onboardingCommandSnapshot.percentComplete)}% · Survey ${
    isSurveyReady ? "ready" : "not ready"
  }`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      {statusChangeDeniedMessage ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {statusChangeDeniedMessage}
        </div>
      ) : null}

      {inviteErrFlag ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {inviteErrFlag}
        </div>
      ) : null}

      {inviteOkFlag ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        >
          Onboarding invite {inviteOkFlag === "sms" ? "text" : inviteOkFlag === "email" ? "email" : ""}{" "}
          sent successfully.
        </div>
      ) : null}

      {toastParam === "employee_archived" ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
        >
          Employee archived: they no longer appear in the default directory view. Compliance history and records are
          unchanged.
        </div>
      ) : toastParam === "employee_archive_denied" ||
          toastParam === "employee_archive_failed" ||
          toastParam === "employee_archive_invalid" ||
          toastParam === "employee_archive_gone" ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {toastParam === "employee_archive_denied"
            ? "You do not have permission to archive employees."
            : toastParam === "employee_archive_gone"
              ? "That employee could not be found."
              : toastParam === "employee_archive_invalid"
                ? "Missing employee id. Refresh and try again."
                : "Could not archive the employee. Try again or check logs."}
        </div>
      ) : null}

      <EmployeeAdminSnapshotStrip
        name={displayName}
        roleLine={roleLine}
        statusLabel={employeeStatusMeta.label}
        statusBadgeClass={employeeStatusMeta.badgeClass}
        onboardingSummaryLine={onboardingSummaryLine}
        email={employee.email || "—"}
        phone={phoneDisplay}
        hireDateLabel={hireDateLabel}
        hireDateDisplay={hireDateDisplay}
      >
        <div className="flex flex-wrap items-center gap-1.5">
                  <form action={updateEmployeeStatus}>
                    <input type="hidden" name="status" value="onboarding" />
                    <button
                      type="submit"
                      className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                    >
                      Mark Onboarding
                    </button>
                  </form>

                  {activationBlockingReasons.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled
                        title={activationBlockingReasons.join(" • ")}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                      >
                        Mark Active
                      </button>
                      <span className="max-w-md text-xs font-medium text-red-700">
                        Cannot mark active: {activationBlockingReasons.join("; ")}
                      </span>
                    </div>
                  ) : !canChangeSensitiveEmployeeStatus ? (
                    <button
                      type="button"
                      disabled
                      title="Only admins and super admins can mark employees active."
                      className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                    >
                      Mark Active
                    </button>
                  ) : (
                    <form action={updateEmployeeStatus}>
                      <input type="hidden" name="status" value="active" />
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                      >
                        Mark Active
                      </button>
                    </form>
                  )}

                  {canChangeSensitiveEmployeeStatus ? (
                    <Link
                      href={`/admin/employees/${employeeId}/exit`}
                      className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                    >
                      Mark Inactive
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="Only admins and super admins can start the inactive / exit workflow."
                      className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                    >
                      Mark Inactive
                    </button>
                  )}

                  <EmployeeArchiveButton
                    applicantId={employeeId}
                    archiveContext="detail"
                    canArchive={!employeeIsInactive}
                    variant="detail"
                  />

                  <a
                    href={`/admin/employees/${employeeId}/employee-file`}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Download Employee File
                  </a>

                  {isSurveyReady ? (
                    <a
                      href={surveyPacketZipHref}
                      download={surveyPacketZipFileName}
                      className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                    >
                      Download Survey Packet
                    </a>
                  ) : null}

                  {isSurveyReady ? (
                    canChangeSensitiveEmployeeStatus ? (
                      <a
                        href={`/admin/employees/${employeeId}/employee-file?save=1`}
                        className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        Save Survey Packet Snapshot
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Only admins and super admins can save survey packet snapshots."
                        className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                      >
                        Save Survey Packet Snapshot
                      </button>
                    )
                  ) : null}

                  {contractPdfHref ? (
                    <a
                      href={contractPdfHref}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Download Contract PDF
                    </a>
                  ) : null}

                  {taxFormPdfHref && employeeTaxForm ? (
                    <a
                      href={taxFormPdfHref}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Download {getTaxFormLabel(employeeTaxForm.form_type)}
                    </a>
                  ) : null}

                  {trainingCertificateHref ? (
                    <a
                      href={trainingCertificateHref}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Download Training Certificate
                    </a>
                  ) : null}

                  {exitInterviewViewUrl ? (
                    <a
                      href={exitInterviewViewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      View Exit Interview
                    </a>
                  ) : null}
        </div>
      </EmployeeAdminSnapshotStrip>
      {!canChangeSensitiveEmployeeStatus ? (
        <p className="border-b border-slate-200 bg-white px-3 pb-2 text-xs text-slate-500 sm:px-4">
          Active/inactive status, exit finalization, credential edits, and survey packet snapshots require
          an admin or super admin.
        </p>
      ) : null}
      <EmployeeAdminActionRequiredTable steps={onboardingCommandSnapshot.blockingSteps} />

      <OnboardingWorkflowSectionCollapsible
        id="onboarding-section"
        title="Initial hiring requirements"
        subtitle="Portal pipeline, hire setup checklist, personnel file audit, and onboarding tools."
        defaultCollapsed={true}
      >
        <AdminOnboardingCommandCenter
          employeeId={employeeId}
          employeeName={displayName}
          snapshot={onboardingCommandSnapshot}
        />
        <div id="onboarding-portal-section" className="mt-4">
          <EmployeeOnboardingCard
            employeeId={employeeId}
            onboardingStatus={
              onboardingStatus ? { ...onboardingStatus, applicant_id: employeeId } : null
            }
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {onboardingStatusItems.map((item) => (
            <WorkflowStatusCard
              key={item.label}
              label={item.label}
              detail={item.detail}
              status={item.status}
            />
          ))}
        </div>

        <div className="mt-4">
          <PersonnelFileAuditDeferred
            items={personnelFileAuditForDeferred}
            surveyReadyBadge={isSurveyReady ? "green" : "red"}
          />
        </div>

        <div
          id="hire-setup-section"
          className="mt-4 grid scroll-mt-24 gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          {hireSetupItems.map((item) => (
            <WorkflowStatusCard
              key={item.label}
              label={item.label}
              detail={item.detail}
              status={item.status}
            />
          ))}
        </div>
      </OnboardingWorkflowSectionCollapsible>

      <OnboardingWorkflowSectionCollapsible
        title="Compliance & ongoing programs"
        subtitle="Annual requirements, program shortcuts, documents dashboard, and compliance history."
        defaultCollapsed={true}
      >
        <p className="text-xs leading-snug text-slate-500">
          Annual compliance uses separate event records so each year stays auditable without overwriting prior
          forms.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 pb-3 text-sm">
          <Link href={skillsHref} className="font-medium text-sky-800 hover:underline">
            Skills <span className="font-normal text-slate-500">({skillsState.label})</span>
          </Link>
          <Link href={performanceHref} className="font-medium text-sky-800 hover:underline">
            Performance <span className="font-normal text-slate-500">({performanceState.label})</span>
          </Link>
          <Link href={oigHref} className="font-medium text-sky-800 hover:underline">
            OIG <span className="font-normal text-slate-500">({oigState.label})</span>
          </Link>
          <Link href={contractHref} className="font-medium text-sky-800 hover:underline">
            Contract review <span className="font-normal text-slate-500">({contractState.label})</span>
          </Link>
          <Link href={trainingHref} className="font-medium text-sky-800 hover:underline">
            Training <span className="font-normal text-slate-500">({trainingState.label})</span>
          </Link>
          <Link href={tbHref} className="font-medium text-sky-800 hover:underline">
            TB statement <span className="font-normal text-slate-500">({tbState.label})</span>
          </Link>
          <Link href="#documents-compliance-dashboard" className="text-xs font-semibold text-sky-700 underline">
            Documents & compliance tables
          </Link>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {complianceSummary.map((item) => (
            <div key={item.label} className="rounded border border-slate-200 bg-slate-50/40 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{item.label}</p>
                  <p className="text-[11px] text-slate-500">{item.progress}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <Link
                    href={item.sectionHref}
                    className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Go
                  </Link>
                  {item.showPrint ? (
                    <a
                      href={item.printHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {item.printLabel}
                    </a>
                  ) : null}
                  {item.showView && item.viewHref ? (
                    <a
                      href={item.viewHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View
                    </a>
                  ) : null}
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${getBadgeClasses(
                      item.tone
                    )}`}
                  >
                    {item.value}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4" id="skills-section">
          <VersionedEventCard
            employeeId={employeeId}
            title="Skills Competency"
            subtitle="Initial and annual clinical competency tracking tied to the active event."
            href={skillsHref}
            printHref={skillsPrintHref}
            event={skillsEvent}
            form={skillsForm}
            progress={skillsProgress}
            historyForms={skillsHistoryFormsPreview}
          />
        </div>

        {actionableReminderItems.length > 0 ? (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50/70 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-950">Needs attention</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-slate-800">
              {actionableReminderItems.slice(0, 10).map((item) => (
                <li key={`${item.label}-${item.status.label}`}>
                  <Link href={item.href} className="font-medium text-sky-800 underline">
                    {item.label}
                  </Link>
                  <span className="text-slate-600"> — {item.status.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-slate-500">
          Program status: use the{" "}
          <Link href="#documents-compliance-dashboard" className="font-semibold text-sky-700 underline">
            documents & compliance tables
          </Link>{" "}
          below and the <span className="font-medium text-slate-700">Action required</span> section above.
        </p>

        <div className="mt-6" id="performance-section">
          <VersionedEventCard
            employeeId={employeeId}
            title="Performance Evaluation"
            subtitle="Annual performance review with draft, finalize, and locked completion flow."
            href={performanceHref}
            printHref={performancePrintHref}
            event={performanceEvent}
            form={performanceForm}
            progress={performanceProgress}
            historyForms={performanceHistoryFormsPreview}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-2 items-start">
          <div className="min-w-0">
            <SimpleComplianceCard
              id="training-checklist-section"
              title="Annual Training Checklist"
              subtitle="Annual training completion tracking for yearly staff compliance."
              event={trainingChecklistEvent}
              actionHref={trainingHref}
            />
          </div>

          <div className="min-w-0">
            <SimpleComplianceCard
              id="contract-review-section"
              title="Contract Annual Review"
              subtitle="Annual contract review tracking for yearly compliance and retention."
              event={contractReviewEvent}
              actionHref={contractHref}
            />
          </div>

          <div className="min-w-0">
            <SimpleComplianceCard
              id="oig-section"
              title="OIG Exclusion Check"
              subtitle="Annual exclusion screening tracking for survey-safe compliance review."
              event={effectiveOigEvent}
              actionHref={oigHref}
            />
          </div>

          <div className="min-w-0">
            <SimpleComplianceCard
              id="tb-statement-section"
              title="Annual TB Statement"
              subtitle="Annual TB statement tracking for employee health compliance."
              event={tbStatementEvent}
              actionHref={tbHref}
            />
          </div>
        </div>

        <div id="event-management" className="mt-6">
          <ComplianceEventManager
            employeeId={employeeId}
            skillsEvent={skillsEvent}
            performanceEvent={performanceEvent}
            trainingEvent={trainingChecklistEvent}
            contractReviewEvent={contractReviewEvent}
            tbStatementEvent={tbStatementEvent}
          />
        </div>

        <div className="mt-6">
          <EmployeeDocumentsComplianceDashboard
            employeeId={employeeId}
            initialHiring={documentsComplianceInitialHiring}
            ongoingCompliance={documentsComplianceOngoing}
            expiringCredentials={documentsComplianceExpiring}
          />
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Annual Compliance History
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Prior annual events stay visible here so admin staff can quickly review and
              print historical compliance records without overwriting prior years.
            </p>
          </div>
        </div>

        {historyRows.length === 0 ? (
          <p className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No compliance history found yet.
          </p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[24px] border border-slate-200">
            <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr_1.4fr] gap-4 bg-slate-50 px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:grid">
              <div>Requirement</div>
              <div>Event Title</div>
              <div>Due Date</div>
              <div>Status</div>
              <div>Completed</div>
              <div>Actions</div>
            </div>

            <div className="divide-y divide-slate-200">
              {historyRows.map(({ event, form, printMeta, printHref }) => {
                const statusLabel =
                  form?.status === "finalized" || event.status === "completed"
                    ? "Completed"
                    : form?.status === "draft"
                      ? "Draft Saved"
                      : event.status
                        ? event.status.replaceAll("_", " ")
                        : "Not started";

                const tone =
                  form?.status === "finalized" || event.status === "completed"
                    ? "green"
                    : form?.status === "draft"
                      ? "amber"
                      : event.status === "pending"
                        ? "sky"
                        : "slate";

                const normalizedEventType = (event.event_type || "").toLowerCase().trim();

                const openHref =
                  normalizedEventType === "skills_checklist"
                    ? `/admin/employees/${employeeId}/forms/skills-competency?eventId=${event.id}`
                    : normalizedEventType === "annual_performance_evaluation"
                      ? `/admin/employees/${employeeId}/forms/performance-evaluation?eventId=${event.id}`
                      : normalizedEventType === "annual_oig_check"
                        ? `/admin/employees/${employeeId}#oig-section`
                        : normalizedEventType === "annual_training"
                          ? `/admin/employees/${employeeId}#training-checklist-section`
                          : normalizedEventType === "annual_tb_statement"
                            ? `/admin/employees/${employeeId}#tb-statement-section`
                            : `/admin/employees/${employeeId}#contract-review-section`;

                return (
                  <div key={event.id} className="px-5 py-5">
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr_1.4fr] lg:items-center">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Requirement
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {getEventTypeLabel(event.event_type)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Event Title
                        </p>
                        <p className="text-sm text-slate-700">
                          {event.event_title || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Due Date
                        </p>
                        <p className="text-sm text-slate-700">
                          {formatDate(event.due_date)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Status
                        </p>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
                            tone as "green" | "red" | "amber" | "sky" | "slate"
                          )}`}
                        >
                          {statusLabel}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 lg:hidden">
                          Completed
                        </p>
                        <p className="text-sm text-slate-700">
                          {formatDateTime(form?.finalized_at || event.completed_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={openHref}
                          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Open
                        </Link>

                        {printMeta.canPrint && printHref ? (
                          <Link
                            href={printHref}
                            className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            {printMeta.label}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </OnboardingWorkflowSectionCollapsible>

      <OnboardingWorkflowSectionCollapsible
        title="Training details"
        subtitle="Onboarding training completion and certificates."
        defaultCollapsed={true}
      >
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-500">Onboarding training</p>
            <p className="mt-1 font-medium text-slate-900">{isTrainingComplete ? "Complete" : "Incomplete"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">Recorded artifacts</p>
            <p className="mt-1 text-slate-800">
              Training progress rows: {trainingProgressRows?.length ?? 0}
              {" · "}
              Completions logged:{" "}
              {(onboardingTrainingCompletions?.length || 0) + (latestTrainingCompletion ? 1 : 0)}
            </p>
          </div>
        </div>
        {trainingCertificateHref ? (
          <a
            href={trainingCertificateHref}
            className="mt-3 inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Download training certificate
          </a>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No training certificate on file yet.</p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Annual checklist:{" "}
          <Link href={trainingHref} className="font-semibold text-sky-700 underline">
            Open annual training checklist
          </Link>
          .
        </p>
      </OnboardingWorkflowSectionCollapsible>

      <OnboardingWorkflowSectionCollapsible
        title="Tax, contracts & agreements"
        subtitle="Employment contract wizard, signatures, and tax forms."
        defaultCollapsed={true}
      >
        <div id="tax-forms-section" className="scroll-mt-24">
          <EmployeeContractTaxSection
            applicantId={employeeId}
            employeeName={displayName}
            initialContract={employeeContract}
            suggestedRoleKey={suggestedContractRole}
            initialTaxForm={employeeTaxForm}
          />
        </div>
      </OnboardingWorkflowSectionCollapsible>
      <OnboardingWorkflowSectionCollapsible
        title="Credentials & expiring"
        subtitle="Monitor CPR, driver’s license, professional license, auto insurance, fingerprint clearance card, and independent contractor insurance tracking."
        defaultCollapsed={true}
      >
        <div
          id="expiring-credentials-section"
          className={`rounded-lg border px-4 py-3 ${
            missingCredentialTypes.length > 0 || overdueRequiredCredentialCount > 0
              ? "border-red-200 bg-red-50 text-red-800"
              : urgentRequiredCredentialCount > 0
                ? "border-red-200 bg-red-50 text-red-800"
                : dueSoonRequiredCredentialCount > 0
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          <p className="text-sm font-semibold">
            {missingCredentialTypes.length > 0
              ? `Missing required credentials: ${missingCredentialTypes
                  .map(formatCredentialType)
                  .join(", ")}.`
              : overdueRequiredCredentialCount > 0
                ? `${overdueRequiredCredentialCount} required credential${
                    overdueRequiredCredentialCount === 1 ? "" : "s"
                  } overdue and need attention.`
                : urgentRequiredCredentialCount > 0
                  ? `${urgentRequiredCredentialCount} required credential${
                      urgentRequiredCredentialCount === 1 ? "" : "s"
                    } due within 7 days.`
                  : dueSoonRequiredCredentialCount > 0
                    ? `${dueSoonRequiredCredentialCount} required credential${
                        dueSoonRequiredCredentialCount === 1 ? "" : "s"
                      } due within 30 days.`
                  : "All credentials compliant."}
          </p>
          <p className="mt-1 text-xs font-medium opacity-80">
            {missingCredentialTypes.length > 0
              ? `${overdueRequiredCredentialCount} overdue, ${urgentRequiredCredentialCount} urgent, ${dueSoonRequiredCredentialCount} due soon.`
              : overdueRequiredCredentialCount > 0
                ? `${urgentRequiredCredentialCount} urgent, ${dueSoonRequiredCredentialCount} due soon.`
                : urgentRequiredCredentialCount > 0
                  ? `${dueSoonRequiredCredentialCount} due soon, ${credentialSummary.active} active overall.`
                  : dueSoonRequiredCredentialCount > 0
                    ? `${credentialSummary.active} active overall, no overdue required credentials.`
                  : `${credentialSummary.active} active credential${
                      credentialSummary.active === 1 ? "" : "s"
                    } on file.`}
          </p>
        </div>

        <p className="mt-3 text-xs text-slate-600">
          Per-credential expiration and actions: see{" "}
          <Link href="#documents-compliance-dashboard" className="font-semibold text-sky-700 underline">
            Expiring / credentials
          </Link>{" "}
          and the tracker below.
        </p>

        <div id="credentials-section" className="mt-4">
          <CredentialManager
            employeeId={employeeId}
            initialCredentials={allEmployeeCredentials}
            allowMutations={canChangeSensitiveEmployeeStatus}
            presentation="dashboard"
          />
        </div>

        <div
          id="credential-reminder-log-section"
          className="mt-6 rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-3"
        >
          <h3 className="text-sm font-semibold text-slate-900">Credential SMS reminder log</h3>
          <p className="mt-1 text-xs text-slate-600">
            One row per credential line included in an outbound text. Source:{" "}
            <code className="rounded bg-white/80 px-1 text-[11px]">employee_credential_reminder_sends</code>.
            Phone shows the number used for that batch when available (newer sends only).
          </p>
          <CredentialReminderCappedTable rows={credentialReminderLog} />
        </div>
      </OnboardingWorkflowSectionCollapsible>

      <WorkflowSection
        title="Saved Survey Packets"
        subtitle="Store and revisit historical survey packet PDFs without relying on the current live file output."
      >
        {savedSurveyPackets.length === 0 ? (
          <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500">
            No saved survey packet snapshots yet. Use “Save Survey Packet Snapshot” once the employee is survey ready.
          </div>
        ) : (
          <div className="grid gap-3">
            {savedSurveyPackets.map((packet, index) => (
              <div
                key={packet.id}
                className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {packet.display_name || packet.file_name || `Survey Packet Snapshot ${index + 1}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Saved {formatDateTime(packet.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {packet.viewUrl ? (
                    <a
                      href={packet.viewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View PDF
                    </a>
                  ) : null}

                  {packet.viewUrl ? (
                    <a
                      href={packet.viewUrl}
                      download={packet.file_name || undefined}
                      className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      Download Snapshot
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkflowSection>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">Admin guidance</h2>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-sm font-semibold text-slate-900">1. Start from the current event</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Admin staff should always enter forms through the employee dashboard so the
              correct annual event is used.
            </p>
          </div>

          <div className="rounded border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-sm font-semibold text-slate-900">2. Draft before finalize</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Draft status protects in-progress work. Finalize should only happen after the
              live review is fully complete and survey-safe.
            </p>
          </div>

          <div className="rounded border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-sm font-semibold text-slate-900">3. Preserve annual history</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Each annual cycle should create a fresh event so prior-year performance and
              competency records stay intact for CHAP and audit review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
