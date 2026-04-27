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
import AdminApplicationSnapshotSection from "./admin-application-snapshot-section";
import EmployeeContractTaxWorkflow from "./employee-contract-tax-workflow";
import EmployeeOnboardingCard from "./EmployeeOnboardingCard";
import { getRequiredCredentialTypesForApplicant } from "@/lib/admin/employee-directory-data";
import {
  buildPersonnelFileAuditRows,
  buildPersonnelFileDocumentKeySet,
  buildApplicantRoleFieldsFromRecord,
  inferContractRoleKeyFromApplicantFields,
  getLatestApplicantUploadByCanonicalType,
  isSalesAgentComplianceBand,
  mergeApplicantRoleHints,
  normalizeCredentialTypeKey,
  normalizePersonnelFileDocumentKey,
} from "@/lib/employee-requirements/personnel-file-requirements";
import {
  employeeDetailAdminTabUrl,
  type EmployeeDetailWorkAreaTab,
} from "@/lib/employee-requirements/employee-detail-work-areas";
import { getCredentialAnchorId } from "@/lib/credential-anchors";
import { EmployeeArchiveButton } from "@/app/admin/employees/EmployeeArchiveButton";
import { buildUnifiedOnboardingState } from "@/lib/onboarding/unified-onboarding-state";
import AdminOnboardingCommandCenter from "./admin-onboarding-command-center";
import EmployeeAdminActionRequiredTable from "./employee-admin-action-required-table";
import EmployeeAdminSnapshotStrip from "./employee-admin-snapshot-strip";
import ComplianceProgramStatusTable, {
  type ComplianceProgramHistoryEntry,
  type ComplianceProgramStatusRow,
} from "./compliance-program-status-table";
import type { PersonnelFileAuditRow } from "@/lib/employee-requirements/personnel-file-requirements";
import OnboardingWorkflowSectionCollapsible from "./onboarding-workflow-section-collapsible";
import PersonnelFileAuditDeferred from "./personnel-file-audit-loader";
import EmployeeDetailTabScroll from "./employee-detail-tab-scroll";
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

function mapProgramsHistory(
  employeeId: string,
  event: ComplianceEvent | null | undefined,
  historyForms: AdminFormRecord[],
  currentForm: AdminFormRecord | null | undefined,
  formOpenHref: string
): ComplianceProgramHistoryEntry[] | undefined {
  if (!event || historyForms.length === 0) return undefined;
  return historyForms.map((historyForm, index) => {
    const versionNumber = historyForms.length - index;
    const isCurrent = historyForm.id === currentForm?.id;
    return {
      id: historyForm.id,
      versionNumber,
      createdAtDisplay: formatDateTime(historyForm.created_at),
      statusLabel: getAdminFormHistoryStatusLabel(historyForm, isCurrent),
      statusBadgeClass: getAdminFormHistoryStatusClasses(historyForm, isCurrent),
      isCurrent,
      viewHref: formOpenHref,
      printHref: getHistoryPrintHref(employeeId, event, historyForm),
    };
  });
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
    contractsWorkflow?: string;
    tab?: string;
  }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const detailTab = resolvedSearchParams?.tab?.trim() || null;
  const showContractsWorkflow = resolvedSearchParams?.contractsWorkflow === "1";
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
        .select("employment_classification, contract_status, employee_signed_at, role_key")
        .eq("applicant_id", employeeId)
        .eq("is_current", true)
        .maybeSingle<{
          employment_classification?: EmployeeContractRow["employment_classification"] | null;
          contract_status?: EmployeeContractRow["contract_status"] | null;
          employee_signed_at?: string | null;
          role_key?: EmployeeContractRow["role_key"] | null;
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

      const applicantFieldsActivation = buildApplicantRoleFieldsFromRecord(employeeStatusRecord);
      const inferredActivationRoleKey = inferContractRoleKeyFromApplicantFields(applicantFieldsActivation);
      const requiredCredentialTypes = getRequiredCredentialTypesForApplicant(
        applicantFieldsActivation,
        currentContract?.employment_classification || null,
        { contractRoleKey: currentContract?.role_key || inferredActivationRoleKey || null }
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

      const { data: activationApplicantFiles } = await supabase
        .from("applicant_files")
        .select("document_type")
        .eq("applicant_id", employeeId);

      const activationUploadKeys = buildPersonnelFileDocumentKeySet(
        (activationApplicantFiles || []).map((f) => String(f.document_type || ""))
      );

      const activationSalesLight = isSalesAgentComplianceBand(
        mergeApplicantRoleHints(buildApplicantRoleFieldsFromRecord(employeeStatusRecord))
      );

      const missingCredentialTypes = requiredCredentialTypes.filter((credentialType) => {
        if (existingCredentialTypes.has(credentialType)) return false;
        if (credentialType === "cpr" && activationUploadKeys.has("cpr_front")) return false;
        if (credentialType === "drivers_license" && activationUploadKeys.has("drivers_license")) {
          return false;
        }
        if (
          credentialType === "auto_insurance" &&
          activationUploadKeys.has("auto_insurance")
        ) {
          return false;
        }
        if (
          credentialType === "independent_contractor_insurance" &&
          activationUploadKeys.has("independent_contractor_insurance")
        ) {
          return false;
        }
        if (
          credentialType === "fingerprint_clearance_card" &&
          activationUploadKeys.has("fingerprint_clearance_card")
        ) {
          return false;
        }
        return true;
      });

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
        (!isSkillsCompleteForActivation && !activationSalesLight)
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

  const [
    { data: applicationWorkHistoryRaw },
    { data: applicationReferencesRaw },
    { data: onboardingEmergencySnapshot },
  ] = await Promise.all([
    supabaseAdmin
      .from("applicant_work_history")
      .select(
        "employer_name, job_title, city_state, dates_employed, primary_duties, reason_for_leaving, sort_order"
      )
      .eq("applicant_id", employeeId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("applicant_references")
      .select("name, relationship, phone, email, sort_order")
      .eq("applicant_id", employeeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("onboarding_contracts")
      .select(
        "emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_secondary, emergency_medical_conditions, emergency_allergies, emergency_acknowledged, emergency_full_name, emergency_signed_at"
      )
      .eq("applicant_id", employeeId)
      .maybeSingle(),
  ]);

  const applicationWorkHistory = (applicationWorkHistoryRaw || []) as Array<{
    employer_name?: string | null;
    job_title?: string | null;
    city_state?: string | null;
    dates_employed?: string | null;
    primary_duties?: string | null;
    reason_for_leaving?: string | null;
  }>;
  const applicationReferences = (applicationReferencesRaw || []) as Array<{
    name?: string | null;
    relationship?: string | null;
    phone?: string | null;
    email?: string | null;
  }>;

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

  const getAdminWorkAreaUrl = (tab: EmployeeDetailWorkAreaTab) =>
    employeeDetailAdminTabUrl(employeePageBase, tab);

  const oigHref = getAdminWorkAreaUrl("compliance");

  const latestOigProof = getLatestApplicantUploadByCanonicalType(adminUploadRecords, "oig_check");
  const latestBackgroundCheckProof = getLatestApplicantUploadByCanonicalType(
    adminUploadRecords,
    "background_check"
  );
  const latestTbTestProof = getLatestApplicantUploadByCanonicalType(adminUploadRecords, "tb_test");
  const latestCprProof = getLatestApplicantUploadByCanonicalType(adminUploadRecords, "cpr_front");
  const latestDriversLicenseProof = getLatestApplicantUploadByCanonicalType(
    adminUploadRecords,
    "drivers_license"
  );
  const latestAutoInsuranceProof = getLatestApplicantUploadByCanonicalType(
    adminUploadRecords,
    "auto_insurance"
  );
  const latestAutoInsuranceProofNormalized =
    latestAutoInsuranceProof ||
    adminUploadRecords.find(
      (file) => normalizePersonnelFileDocumentKey(file.document_type) === "auto_insurance"
    ) ||
    null;
  const latestIndependentContractorInsuranceProof = getLatestApplicantUploadByCanonicalType(
    adminUploadRecords,
    "independent_contractor_insurance"
  );
  const latestFingerprintProof = getLatestApplicantUploadByCanonicalType(
    adminUploadRecords,
    "fingerprint_clearance_card"
  );

  const uploadedDocumentTypes = buildPersonnelFileDocumentKeySet([
    ...(documentsRows || []).map((document) =>
      String(
        (document as {
          document_type?: string | null;
        }).document_type || ""
      )
    ),
    ...applicantFiles.map((file) => String(file.document_type || "")),
  ]);
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

  const applicantFieldsForRequirements = buildApplicantRoleFieldsFromRecord(employeeRecord);
  const mergedRoleHint = mergeApplicantRoleHints(applicantFieldsForRequirements);
  const salesAgentLight = isSalesAgentComplianceBand(mergedRoleHint);
  const effectiveContractRoleKey =
    employeeContract?.role_key ||
    inferContractRoleKeyFromApplicantFields(applicantFieldsForRequirements) ||
    null;

  const requiredCredentialTypes = getRequiredCredentialTypesForApplicant(
    applicantFieldsForRequirements,
    effectiveEmploymentClassification,
    { contractRoleKey: effectiveContractRoleKey }
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
      credentialType === "drivers_license" &&
      (uploadedDocumentTypes.has("drivers_license") || !!latestDriversLicenseProof)
    ) {
      return false;
    }
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
    !requiresDriversLicense ||
    existingCredentialTypes.has("drivers_license") ||
    uploadedDocumentTypes.has("drivers_license") ||
    !!latestDriversLicenseProof;
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
        href: getAdminWorkAreaUrl("credentials"),
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

  const missingSurveyItemsClinical = [
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

  /** Sales band omits clinical/survey file items; keep aligned with `salesAgentLightCompliance` in unified onboarding. */
  const missingSurveyItemsSales = [
    !isApplicationComplete ? "Application" : null,
    !hasBackgroundCheck ? "Background Check" : null,
    !isContractsComplete ? "Contracts" : null,
    !isTaxFormSigned ? "Tax Form" : null,
    !hasDriversLicense ? "Driver’s License" : null,
    ...(requiresAutoInsurance ? [!hasAutoInsurance ? "Auto Insurance" : null] : []),
    ...(requiresIndependentContractorInsurance
      ? [!hasIndependentContractorInsurance ? "Independent Contractor Insurance" : null]
      : []),
  ].filter((item): item is string => Boolean(item));

  const missingSurveyItems = (salesAgentLight ? missingSurveyItemsSales : missingSurveyItemsClinical).filter(
    (item): item is string => Boolean(item)
  );

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
    salesAgentLightCompliance: salesAgentLight,
    treatPipelineDocumentsAsCompleteForProgress: salesAgentLight,
    treatPipelineTrainingAsCompleteForProgress: salesAgentLight,
    getAdminWorkAreaUrl,
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
      sectionHref: getAdminWorkAreaUrl("skills"),
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
      sectionHref: getAdminWorkAreaUrl("performance"),
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
      sectionHref: getAdminWorkAreaUrl("compliance"),
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
      sectionHref: getAdminWorkAreaUrl("compliance"),
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
      sectionHref: getAdminWorkAreaUrl("compliance"),
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
      sectionHref: getAdminWorkAreaUrl("compliance"),
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

  const personnelFileAuditForDeferred: PersonnelFileAuditRow[] = buildPersonnelFileAuditRows({
    applicantId: employeeId,
    isSalesAgent: salesAgentLight,
    isApplicationComplete,
    isDocumentsComplete,
    isContractsComplete,
    isTaxFormSigned,
    isTrainingComplete,
    isSkillsComplete,
    isPerformanceComplete,
    hasTbDocumentation,
    isOigComplete,
    hasBackgroundCheck,
    requiresCpr,
    hasCprCard,
    requiresDriversLicense,
    hasDriversLicense,
    requiresFingerprintCard,
    hasFingerprintCard,
    requiresAutoInsurance,
    hasAutoInsurance,
    requiresIndependentContractorInsurance,
    hasIndependentContractorInsurance,
    applicationViewHref,
    trainingCertificateHref,
    contractPdfHref,
    taxFormPdfHref,
    skillsPrintHref,
    skillsCanPrint: skillsPrintMeta.canPrint,
    performancePrintHref,
    performanceCanPrint: performancePrintMeta.canPrint,
    latestCprViewUrl: (latestCprProof as AdminUploadRecord | null)?.viewUrl ?? null,
    latestDriversLicenseViewUrl: (latestDriversLicenseProof as AdminUploadRecord | null)?.viewUrl ?? null,
    latestFingerprintViewUrl: (latestFingerprintProof as AdminUploadRecord | null)?.viewUrl ?? null,
    latestAutoInsuranceViewUrl: (latestAutoInsuranceProofNormalized as AdminUploadRecord | null)?.viewUrl ?? null,
    latestIndependentContractorInsuranceViewUrl:
      (latestIndependentContractorInsuranceProof as AdminUploadRecord | null)?.viewUrl ?? null,
    latestTbViewUrl: (latestTbTestProof as AdminUploadRecord | null)?.viewUrl ?? null,
    latestOigViewUrl: (latestOigProof as AdminUploadRecord | null)?.viewUrl ?? null,
    latestBackgroundCheckViewUrl: (latestBackgroundCheckProof as AdminUploadRecord | null)?.viewUrl ?? null,
    getAdminWorkAreaUrl,
  });

  const hasInitialDriversLicenseUpload =
    uploadedDocumentTypes.has("drivers_license") || Boolean(latestDriversLicenseProof);
  const hasInitialAutoInsuranceUpload = Boolean(latestAutoInsuranceProofNormalized);

  const driversLicenseHistory = adminUploadRecords
    .filter((file) => (file.document_type || "").toLowerCase().trim() === "drivers_license")
    .slice()
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

  const autoInsuranceHistory = adminUploadRecords
    .filter(
      (file) =>
        (file.document_type || "").toLowerCase().trim() === "auto_insurance" ||
        normalizeCredentialTypeKey(file.document_type) === "auto_insurance"
    )
    .slice()
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
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
      workflowOpenHref: getAdminWorkAreaUrl("compliance"),
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
      workflowOpenHref: getAdminWorkAreaUrl("documents"),
    },
    {
      key: "drivers-license-initial",
      label: "Driver’s License (initial file)",
      statusLabel: hasInitialDriversLicenseUpload ? "On file" : "Missing",
      statusTone: hasInitialDriversLicenseUpload ? "green" : "red",
      lastUpdatedDisplay: latestDriversLicenseProof?.created_at
        ? formatDateTime(latestDriversLicenseProof.created_at)
        : "—",
      viewUrl: (latestDriversLicenseProof as AdminUploadRecord | null)?.viewUrl ?? null,
      documentType: "drivers_license",
      uploadLabel: "Driver’s License",
      anchorId: "drivers-license-section",
      history: buildAdminUploadHistoryDisplay(driversLicenseHistory),
      workflowOpenHref: getAdminWorkAreaUrl("credentials"),
    },
    {
      key: "auto-insurance-initial",
      label: "Auto Insurance (initial file)",
      statusLabel: hasInitialAutoInsuranceUpload ? "On file" : "Missing",
      statusTone: hasInitialAutoInsuranceUpload ? "green" : "red",
      lastUpdatedDisplay: latestAutoInsuranceProofNormalized?.created_at
        ? formatDateTime(latestAutoInsuranceProofNormalized.created_at)
        : "—",
      viewUrl: (latestAutoInsuranceProofNormalized as AdminUploadRecord | null)?.viewUrl ?? null,
      documentType: "auto_insurance",
      uploadLabel: "Auto Insurance",
      anchorId: "auto_insurance-section",
      history: buildAdminUploadHistoryDisplay(autoInsuranceHistory),
      workflowOpenHref: getAdminWorkAreaUrl("credentials"),
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
      workflowOpenHref: getAdminWorkAreaUrl("credentials"),
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
      workflowOpenHref: getAdminWorkAreaUrl("documents"),
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

  const skillsRowState = getRequirementState(skillsEvent, skillsForm);
  const skillsRowPrint = getPrintMeta(skillsForm, skillsEvent);
  const skillsRowLocked = isComplianceRequirementComplete(skillsEvent, skillsForm);
  const skillsRowHistory = mapProgramsHistory(
    employeeId,
    skillsEvent,
    skillsHistoryForms,
    skillsForm,
    skillsHref
  );
  const skillsRowStartNew =
    skillsEvent?.id && skillsRowLocked
      ? `${skillsHref}${skillsHref.includes("?") ? "&" : "?"}startNewVersion=1`
      : null;
  const skillsRowShowDetails = Boolean(
    skillsRowState.description ||
      skillsProgress.total > 0 ||
      (skillsRowHistory?.length ?? 0) > 0
  );

  const perfRowState = getRequirementState(performanceEvent, performanceForm);
  const perfRowPrint = getPrintMeta(performanceForm, performanceEvent);
  const perfRowLocked = isComplianceRequirementComplete(performanceEvent, performanceForm);
  const perfRowHistory = mapProgramsHistory(
    employeeId,
    performanceEvent,
    performanceHistoryForms,
    performanceForm,
    performanceHref
  );
  const perfRowStartNew =
    performanceEvent?.id && perfRowLocked
      ? `${performanceHref}${performanceHref.includes("?") ? "&" : "?"}startNewVersion=1`
      : null;
  const perfRowShowDetails = Boolean(
    perfRowState.description ||
      performanceProgress.total > 0 ||
      (perfRowHistory?.length ?? 0) > 0
  );

  const trainingRowState = getRequirementState(trainingChecklistEvent, null);
  const contractRowState = getRequirementState(contractReviewEvent, null);
  const oigRowState = getRequirementState(effectiveOigEvent, null);
  const tbRowState = getRequirementState(tbStatementEvent, null);

  const complianceProgramStatusRows: ComplianceProgramStatusRow[] = [
    {
      rowKey: "skills",
      sectionId: "skills-section",
      program: "Skills Competency",
      subtitle: "Initial & annual clinical competency",
      currentRecord: skillsEvent?.event_title || "—",
      statusLabel: skillsRowState.label,
      statusBadgeClass: getBadgeClasses(skillsRowState.tone),
      dueDateDisplay: formatDate(skillsEvent?.due_date),
      primaryHref: skillsHref,
      primaryLabel: skillsRowState.buttonText,
      printHref: skillsRowPrint.canPrint ? skillsPrintHref : null,
      printLabel: skillsRowPrint.label || undefined,
      startNewVersionHref: skillsRowStartNew,
      progressPercent: skillsProgress.total > 0 ? skillsProgress.percent : null,
      progressTotal: skillsProgress.total > 0 ? skillsProgress.total : null,
      description: skillsRowState.description,
      history: skillsRowHistory,
      showDetails: skillsRowShowDetails,
    },
    {
      rowKey: "performance",
      sectionId: "performance-section",
      program: "Performance Evaluation",
      subtitle: "Annual performance review",
      currentRecord: performanceEvent?.event_title || "—",
      statusLabel: perfRowState.label,
      statusBadgeClass: getBadgeClasses(perfRowState.tone),
      dueDateDisplay: formatDate(performanceEvent?.due_date),
      primaryHref: performanceHref,
      primaryLabel: perfRowState.buttonText,
      printHref: perfRowPrint.canPrint ? performancePrintHref : null,
      printLabel: perfRowPrint.label || undefined,
      startNewVersionHref: perfRowStartNew,
      progressPercent: performanceProgress.total > 0 ? performanceProgress.percent : null,
      progressTotal: performanceProgress.total > 0 ? performanceProgress.total : null,
      description: perfRowState.description,
      history: perfRowHistory,
      showDetails: perfRowShowDetails,
    },
    {
      rowKey: "training",
      sectionId: "training-checklist-section",
      program: "Annual Training Checklist",
      subtitle: "Yearly training tracking",
      currentRecord: trainingChecklistEvent?.event_title || "—",
      statusLabel: trainingRowState.label,
      statusBadgeClass: getBadgeClasses(trainingRowState.tone),
      dueDateDisplay: formatDate(trainingChecklistEvent?.due_date),
      primaryHref: trainingHref,
      primaryLabel: trainingChecklistEvent?.id ? "Open" : "Create",
      showDetails: false,
    },
    {
      rowKey: "contract-review",
      sectionId: "contract-review-section",
      program: "Contract Annual Review",
      subtitle: "Annual contract review",
      currentRecord: contractReviewEvent?.event_title || "—",
      statusLabel: contractRowState.label,
      statusBadgeClass: getBadgeClasses(contractRowState.tone),
      dueDateDisplay: formatDate(contractReviewEvent?.due_date),
      primaryHref: contractHref,
      primaryLabel: contractReviewEvent?.id ? "Open" : "Create",
      showDetails: false,
    },
    {
      rowKey: "oig",
      sectionId: "oig-section",
      program: "OIG Exclusion Check",
      subtitle: "Annual exclusion screening",
      currentRecord: effectiveOigEvent?.event_title || "—",
      statusLabel: oigRowState.label,
      statusBadgeClass: getBadgeClasses(oigRowState.tone),
      dueDateDisplay: formatDate(effectiveOigEvent?.due_date),
      primaryHref: oigHref,
      primaryLabel: effectiveOigEvent?.id ? "Open" : "Create",
      showDetails: false,
    },
    {
      rowKey: "tb",
      sectionId: "tb-statement-section",
      program: "Annual TB Statement",
      subtitle: "Annual TB attestation",
      currentRecord: tbStatementEvent?.event_title || "—",
      statusLabel: tbRowState.label,
      statusBadgeClass: getBadgeClasses(tbRowState.tone),
      dueDateDisplay: formatDate(tbStatementEvent?.due_date),
      primaryHref: tbHref,
      primaryLabel: tbStatementEvent?.id ? "Open" : "Create",
      showDetails: false,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <EmployeeDetailTabScroll tab={detailTab} />
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
        readinessSummaryLine={onboardingSummaryLine}
        activationBlockerSummary={
          activationBlockingReasons.length > 0 ? activationBlockingReasons.join("; ") : null
        }
        email={employee.email || "—"}
        phone={phoneDisplay}
        hireDateLabel={hireDateLabel}
        hireDateDisplay={hireDateDisplay}
      >
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
                    <button
                      type="button"
                      disabled
                      title={activationBlockingReasons.join(" • ")}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                    >
                      Mark Active
                    </button>
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
        expandWhenTab={["overview", "training", "payroll"]}
      >
        <AdminApplicationSnapshotSection
          employeeId={employeeId}
          applicationViewHref={applicationViewHref}
          employee={employeeRecord}
          onboardingStatus={onboardingStatus ?? null}
          workHistory={applicationWorkHistory}
          references={applicationReferences}
          emergency={onboardingEmergencySnapshot ?? null}
        />
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
        id="compliance-programs-section"
        title="Compliance & ongoing programs"
        subtitle="Annual requirements, program shortcuts, documents dashboard, and compliance history."
        defaultCollapsed={true}
        expandWhenTab={["documents", "skills", "performance", "compliance"]}
      >
        <p className="text-[11px] leading-snug text-slate-500">
          Annual compliance uses separate event records so each year stays auditable without overwriting prior
          forms. Deep links:{" "}
          <Link href={skillsHref} className="font-medium text-sky-800 hover:underline">
            Skills
          </Link>
          {" · "}
          <Link href={performanceHref} className="font-medium text-sky-800 hover:underline">
            Performance
          </Link>
          {" · "}
          <Link href={oigHref} className="font-medium text-sky-800 hover:underline">
            OIG
          </Link>
          {" · "}
          <Link href={contractHref} className="font-medium text-sky-800 hover:underline">
            Contract
          </Link>
          {" · "}
          <Link href={trainingHref} className="font-medium text-sky-800 hover:underline">
            Training
          </Link>
          {" · "}
          <Link href={tbHref} className="font-medium text-sky-800 hover:underline">
            TB
          </Link>
          {" · "}
          <Link href={getAdminWorkAreaUrl("documents")} className="font-semibold text-sky-700 underline">
            Documents
          </Link>
          . Status: also see <span className="font-medium text-slate-700">Action required</span> above.
        </p>

        <div className="mt-2 border-b border-slate-100 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Compliance overview</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {complianceSummary.map((item) => (
              <div
                key={item.label}
                className="flex min-w-0 max-w-full items-center gap-1.5 rounded border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px]"
              >
                <span className="font-semibold text-slate-800">{item.label}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${getBadgeClasses(
                    item.tone
                  )}`}
                >
                  {item.value}
                </span>
                <Link
                  href={item.sectionHref}
                  className="shrink-0 font-semibold text-sky-800 underline"
                >
                  Go
                </Link>
                {item.showPrint ? (
                  <a
                    href={item.printHref}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-semibold text-sky-800 underline"
                  >
                    {item.printLabel}
                  </a>
                ) : null}
                {item.showView && item.viewHref ? (
                  <a
                    href={item.viewHref}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 font-semibold text-sky-800 underline"
                  >
                    View
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {actionableReminderItems.length > 0 ? (
          <div className="mt-2 rounded border border-amber-200 bg-amber-50/80 px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-950">Needs attention</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-800">
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

        <div id="compliance-program-status" className="mt-3 scroll-mt-24">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Program status</p>
          <div className="mt-1">
            <ComplianceProgramStatusTable rows={complianceProgramStatusRows} />
          </div>
        </div>

        <div id="event-management" className="mt-3">
          <ComplianceEventManager
            employeeId={employeeId}
            skillsEvent={skillsEvent}
            performanceEvent={performanceEvent}
            trainingEvent={trainingChecklistEvent}
            contractReviewEvent={contractReviewEvent}
            tbStatementEvent={tbStatementEvent}
            presentation="compact"
          />
        </div>

        <div className="mt-3">
          <EmployeeDocumentsComplianceDashboard
            employeeId={employeeId}
            initialHiring={documentsComplianceInitialHiring}
            ongoingCompliance={documentsComplianceOngoing}
            expiringCredentials={documentsComplianceExpiring}
          />
        </div>

        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Annual compliance history
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Prior year events — open or print without overwriting current cycle.
          </p>

          {historyRows.length === 0 ? (
            <p className="mt-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
              No compliance history yet.
            </p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
              <div className="hidden gap-2 bg-slate-50 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[1fr_1fr_minmax(0,0.9fr)_auto_auto_minmax(0,1.1fr)]">
                <div>Requirement</div>
                <div>Title</div>
                <div>Due</div>
                <div>Status</div>
                <div>Completed</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="divide-y divide-slate-100">
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
                          ? getAdminWorkAreaUrl("compliance")
                          : normalizedEventType === "annual_training"
                            ? getAdminWorkAreaUrl("compliance")
                            : normalizedEventType === "annual_tb_statement"
                              ? getAdminWorkAreaUrl("compliance")
                              : getAdminWorkAreaUrl("compliance");

                  return (
                    <div
                      key={event.id}
                      className="grid gap-1.5 px-2 py-1.5 text-xs lg:grid-cols-[1fr_1fr_minmax(0,0.9fr)_auto_auto_minmax(0,1.1fr)] lg:items-center"
                    >
                      <div className="font-semibold text-slate-900">
                        {getEventTypeLabel(event.event_type)}
                      </div>
                      <div className="text-slate-700 [overflow-wrap:anywhere]">{event.event_title || "—"}</div>
                      <div className="text-slate-600">{formatDate(event.due_date)}</div>
                      <div>
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${getBadgeClasses(
                            tone as "green" | "red" | "amber" | "sky" | "slate"
                          )}`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        {formatDateTime(form?.finalized_at || event.completed_at)}
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Link
                          href={openHref}
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Open
                        </Link>
                        {printMeta.canPrint && printHref ? (
                          <Link
                            href={printHref}
                            className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100"
                          >
                            {printMeta.label}
                          </Link>
                        ) : null}
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
        subtitle="Compact status and actions — open the workflow when you need to prepare, send, or sign."
        defaultCollapsed={true}
      >
        <EmployeeContractTaxWorkflow
          employeeId={employeeId}
          employeeName={displayName}
          employeePageBase={employeePageBase}
          showWorkflowInitially={showContractsWorkflow}
          initialContract={employeeContract}
          suggestedRoleKey={suggestedContractRole}
          initialTaxForm={employeeTaxForm}
          contractPdfHref={contractPdfHref}
          taxFormPdfHref={taxFormPdfHref}
          isTaxFormSigned={isTaxFormSigned}
        />
      </OnboardingWorkflowSectionCollapsible>
      <OnboardingWorkflowSectionCollapsible
        title="Credentials & expiring"
        subtitle="Monitor CPR, driver’s license, professional license, auto insurance, fingerprint clearance card, and independent contractor insurance tracking."
        defaultCollapsed={true}
        expandWhenTab={["credentials"]}
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
          <Link href={getAdminWorkAreaUrl("documents")} className="font-semibold text-sky-700 underline">
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
