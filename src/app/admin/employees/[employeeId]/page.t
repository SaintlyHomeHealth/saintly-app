import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/admin";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  updated_at?: string | null;
  form_type?: string | null;
  form_data?: {
    discipline?: string;
    items?: Record<string, string>;
    [key: string]: unknown;
  } | null;
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
  event?: ComplianceEvent | null,
  form?: AdminFormRecord | null
) {
  return form?.status === "finalized" || event?.status === "completed" || !!event?.completed_at;
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
  const isFormFinalized = form?.status === "finalized";
  const isFormDraft = form?.status === "draft";
  const isEventCompleted = event?.status === "completed";

  const isOverdue =
    !isFormFinalized &&
    !isEventCompleted &&
    !!dueDate &&
    !Number.isNaN(dueDate.getTime()) &&
    dueDate.getTime() < now.getTime();

  if (isFormFinalized || isEventCompleted) {
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
  const isDraft = form?.status === "draft";
  const isFinalized = form?.status === "finalized" || event?.status === "completed";
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

function formatCredentialType(type: string) {
  switch ((type || "").toLowerCase().trim()) {
    case "professional_license":
      return "Professional License";
    case "cpr":
      return "CPR";
    case "drivers_license":
      return "Driver’s License";
    case "tb_expiration":
      return "TB Expiration";
    default:
      return type || "Credential";
  }
}

function getRequiredCredentialTypes(roleValue?: string | null) {
  const normalizedRole = (roleValue || "").toLowerCase().trim();

  if (!normalizedRole) {
    return [];
  }

  if (
    normalizedRole === "rn" ||
    normalizedRole === "lpn" ||
    normalizedRole === "lvn" ||
    normalizedRole.includes("registered nurse") ||
    normalizedRole.includes("licensed practical nurse") ||
    normalizedRole.includes("licensed vocational nurse")
  ) {
    return ["professional_license", "cpr", "tb_expiration", "drivers_license"];
  }

  if (
    normalizedRole.includes("caregiver") ||
    normalizedRole.includes("hha") ||
    normalizedRole.includes("cna")
  ) {
    return ["cpr", "tb_expiration", "drivers_license"];
  }

  return [];
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

function EventCard({
  title,
  subtitle,
  href,
  printHref,
  event,
  form,
  progress,
}: {
  title: string;
  subtitle: string;
  href: string;
  printHref: string;
  event?: ComplianceEvent | null;
  form?: AdminFormRecord | null;
  progress: ProgressSummary;
}) {
  const state = getRequirementState(event, form);
  const printMeta = getPrintMeta(form, event);

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
              Form Status
            </p>
            <p className="mt-1 text-sm font-medium capitalize text-slate-900">
              {form?.status ? form.status.replaceAll("_", " ") : "No form yet"}
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Progress
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {progress.total > 0
                ? `${progress.percent}% (${progress.completed}/${progress.total})`
                : "0%"}
            </p>
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
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
            className={`inline-flex min-w-[220px] items-center justify-center rounded-[24px] px-6 py-4 text-base font-semibold shadow-lg transition ${getButtonClasses(
              state.tone
            )}`}
          >
            {state.buttonText}
          </Link>

          {printMeta.canPrint ? (
            <Link
              href={printHref}
              className="inline-flex min-w-[220px] items-center justify-center rounded-[24px] border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {printMeta.label}
            </Link>
          ) : null}
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
}: {
  id: string;
  title: string;
  subtitle: string;
  event?: ComplianceEvent | null;
}) {
  const state = getRequirementState(event, null);

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

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id?: string; employeeId?: string }>;
}) {
  const resolvedParams = await params;
  const employeeId = resolvedParams.employeeId || resolvedParams.id;

  if (!employeeId) {
    return <div className="p-6">Invalid employee ID</div>;
  }

  async function updateEmployeeStatus(formData: FormData) {
    "use server";

    const nextStatus = String(formData.get("status") || "").toLowerCase().trim();

    if (!["onboarding", "active", "inactive"].includes(nextStatus)) {
      redirect(`/admin/employees/${employeeId}`);
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

      const roleCandidates = [
        getStringField(employeeStatusRecord, "position"),
        getStringField(employeeStatusRecord, "position_applied"),
        getStringField(employeeStatusRecord, "discipline"),
        getStringField(employeeStatusRecord, "job_title"),
        getStringField(employeeStatusRecord, "title"),
        getStringField(employeeStatusRecord, "role"),
        getStringField(employeeStatusRecord, "role_title"),
        getStringField(employeeStatusRecord, "selected_role"),
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

      const requiredCredentialTypes =
        roleCandidates
          .map((value) => getRequiredCredentialTypes(value))
          .find((types) => types.length > 0) || [];

      if (requiredCredentialTypes.length > 0) {
        const { data: credentialRows } = await supabase
          .from("employee_credentials")
          .select("credential_type")
          .eq("employee_id", employeeId);

        const existingCredentialTypes = new Set(
          (credentialRows || []).map((credential) =>
            String(credential.credential_type || "").toLowerCase().trim()
          )
        );

        const missingCredentialTypes = requiredCredentialTypes.filter(
          (credentialType) => !existingCredentialTypes.has(credentialType)
        );

        if (missingCredentialTypes.length > 0) {
          redirect(`/admin/employees/${employeeId}`);
        }
      }
    }

    await supabase.from("applicants").update({ status: nextStatus }).eq("id", employeeId);

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

  const { data: employeeContractRaw } = await supabase
    .from("employee_contracts")
    .select("*")
    .eq("applicant_id", employeeId)
    .eq("is_current", true)
    .single<EmployeeContractRow>();

  const employeeContract = employeeContractRaw || null;
  const { data: onboardingContractStatus } = await supabase
    .from("onboarding_contracts")
    .select("completed")
    .eq("applicant_id", employeeId)
    .maybeSingle<{ completed?: boolean | null }>();
  let employeeTaxForm: EmployeeTaxFormRow | null = null;

  {
    const { data: employeeTaxFormRaw } = await supabase
      .from("employee_tax_forms")
      .select("*")
      .eq("applicant_id", employeeId)
      .eq("is_current", true)
      .maybeSingle<EmployeeTaxFormRow>();

    employeeTaxForm = employeeTaxFormRaw || null;
  }

  const { data: onboardingStatus } = await supabase
    .from("onboarding_status")
    .select("application_completed")
    .eq("applicant_id", employeeId)
    .maybeSingle<{ application_completed?: boolean | null }>();

  const { data: applicantFiles } = await supabase
    .from("applicant_files")
    .select("id")
    .eq("applicant_id", employeeId);

  const { data: documentsRows } = await supabase
    .from("documents")
    .select("id")
    .eq("applicant_id", employeeId);

  const { data: onboardingTrainingCompletions } = await supabase
    .from("onboarding_training_completions")
    .select("id")
    .eq("applicant_id", employeeId);

  const { data: trainingProgressRows } = await supabase
    .from("applicant_training_progress")
    .select("id, is_complete")
    .eq("applicant_id", employeeId);

  const { data: latestTrainingCompletion } = await supabase
    .from("employee_training_completions")
    .select("id")
    .eq("applicant_id", employeeId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { data: exitInterviewRaw } = await supabaseAdmin
    .from("employee_exit_interviews")
    .select("id, employee_id, reason_for_leaving, separation_type, rehire_eligible, notes, created_at")
    .eq("employee_id", employeeId)
    .limit(1)
    .maybeSingle();

  const exitInterview = (exitInterviewRaw || null) as ExitInterviewRecord | null;
  let exitInterviewViewUrl: string | null = null;

  if (exitInterview) {
    const { data: signedUrlData } = await supabaseAdmin.storage
      .from("applicant-files")
      .createSignedUrl(getExitInterviewPdfPath(employeeId), 60 * 60);

    exitInterviewViewUrl = signedUrlData?.signedUrl || null;
  }

  const { data: skillsEvent } = await supabase
    .from("admin_compliance_events")
    .select("id, status, event_title, due_date, completed_at, event_type, created_at")
    .eq("applicant_id", employeeId)
    .eq("event_type", "skills_checklist")
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceEvent>();

  const { data: performanceEvent } = await supabase
    .from("admin_compliance_events")
    .select("id, status, event_title, due_date, completed_at, event_type, created_at")
    .eq("applicant_id", employeeId)
    .eq("event_type", "annual_performance_evaluation")
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceEvent>();

  const { data: oigEvent } = await supabase
    .from("admin_compliance_events")
    .select("id, status, event_title, due_date, completed_at, event_type, created_at")
    .eq("applicant_id", employeeId)
    .eq("event_type", "annual_oig_check")
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceEvent>();

  const { data: contractReviewEvent } = await supabase
    .from("admin_compliance_events")
    .select("id, status, event_title, due_date, completed_at, event_type, created_at")
    .eq("applicant_id", employeeId)
    .in("event_type", ["annual_contract_review", "contract_annual_review"])
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceEvent>();

  const { data: trainingChecklistEvent } = await supabase
    .from("admin_compliance_events")
    .select("id, status, event_title, due_date, completed_at, event_type, created_at")
    .eq("applicant_id", employeeId)
    .eq("event_type", "annual_training")
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceEvent>();

  const { data: tbStatementEvent } = await supabase
    .from("admin_compliance_events")
    .select("id, status, event_title, due_date, completed_at, event_type, created_at")
    .eq("applicant_id", employeeId)
    .eq("event_type", "annual_tb_statement")
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle<ComplianceEvent>();

  const { data: credentials } = await supabase
    .from("employee_credentials")
    .select("*")
    .eq("employee_id", employeeId)
    .order("expiration_date", { ascending: true });

  const employeeCredentials = (credentials || []) as CredentialRecord[];

  const skillsFormQuery = supabase
    .from("employee_admin_forms")
    .select("id, status, compliance_event_id, finalized_at, updated_at, form_data, form_type")
    .eq("employee_id", employeeId)
    .eq("form_type", "skills_competency")
    .order("updated_at", { ascending: false })
    .limit(1);

  const performanceFormQuery = supabase
    .from("employee_admin_forms")
    .select("id, status, compliance_event_id, finalized_at, updated_at, form_data, form_type")
    .eq("employee_id", employeeId)
    .eq("form_type", "performance_evaluation")
    .order("updated_at", { ascending: false })
    .limit(1);

  const { data: skillsFormRows } = skillsEvent?.id
    ? await skillsFormQuery.eq("compliance_event_id", skillsEvent.id)
    : await skillsFormQuery.is("compliance_event_id", null);

  const { data: performanceFormRows } = performanceEvent?.id
    ? await performanceFormQuery.eq("compliance_event_id", performanceEvent.id)
    : await performanceFormQuery.is("compliance_event_id", null);

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
  const contractHref = `/admin/employees/${employeeId}#contract-review-section`;
  const trainingHref = `/admin/employees/${employeeId}#training-checklist-section`;
  const tbHref = `/admin/employees/${employeeId}#tb-statement-section`;
  const contractPdfHref = employeeContract
    ? `/admin/employees/${employeeId}/employee-file?document=contract`
    : null;
  const taxFormPdfHref = employeeTaxForm
    ? `/admin/employees/${employeeId}/employee-file?document=tax`
    : null;
  const trainingCertificateHref = latestTrainingCompletion
    ? `/admin/employees/${employeeId}/employee-file?document=training`
    : null;

  const skillsState = getRequirementState(skillsEvent, skillsForm);
  const performanceState = getRequirementState(performanceEvent, performanceForm);
  const oigState = getRequirementState(oigEvent, null);
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
    { source: "position_applied", value: getStringField(employeeRecord, "position_applied") },
    { source: "discipline", value: getStringField(employeeRecord, "discipline") },
    { source: "job_title", value: getStringField(employeeRecord, "job_title") },
    { source: "title", value: getStringField(employeeRecord, "title") },
    { source: "role", value: getStringField(employeeRecord, "role") },
    { source: "role_title", value: getStringField(employeeRecord, "role_title") },
    { source: "selected_role", value: getStringField(employeeRecord, "selected_role") },
  ].filter(
    (candidate): candidate is { source: string; value: string } =>
      typeof candidate.value === "string" && candidate.value.trim().length > 0
  );

  const detectedRoleCandidate =
    roleCandidates.find((candidate) => getRequiredCredentialTypes(candidate.value).length > 0) ||
    roleCandidates[0] ||
    null;

  const suggestedContractRole =
    roleCandidates
      .map((candidate) => inferContractRoleFromText(candidate.value))
      .find((value): value is NonNullable<typeof value> => Boolean(value)) || "";

  const requiredCredentialTypes =
    (detectedRoleCandidate
      ? getRequiredCredentialTypes(detectedRoleCandidate.value)
      : []) || [];

  const existingCredentialTypes = new Set(
    employeeCredentials.map((credential) =>
      (credential.credential_type || "").toLowerCase().trim()
    )
  );

  const missingCredentialTypes = requiredCredentialTypes.filter(
    (credentialType) => !existingCredentialTypes.has(credentialType)
  );

  const isApplicationComplete = onboardingStatus?.application_completed === true;
  const isDocumentsComplete =
    (applicantFiles?.length || 0) > 0 || (documentsRows?.length || 0) > 0;
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
  const isTbComplete = isComplianceRequirementComplete(tbStatementEvent, null);
  const isOigComplete = isComplianceRequirementComplete(oigEvent, null);
  const requiresCpr = requiredCredentialTypes.includes("cpr");
  const requiresDriversLicense = requiredCredentialTypes.includes("drivers_license");
  const hasCprCard = !requiresCpr || existingCredentialTypes.has("cpr");
  const hasDriversLicense =
    !requiresDriversLicense || existingCredentialTypes.has("drivers_license");

  const missingSurveyItems = [
    !isApplicationComplete ? "Application" : null,
    !isDocumentsComplete ? "Documents" : null,
    !isContractsComplete ? "Contracts" : null,
    !isTrainingComplete ? "Training" : null,
    !isSkillsComplete ? "Skills Competency" : null,
    !isPerformanceComplete ? "Performance Evaluation" : null,
    !isTbComplete ? "TB" : null,
    !isOigComplete ? "OIG" : null,
    !isTaxFormSigned ? "Tax Form" : null,
    !hasCprCard ? "CPR Card" : null,
    !hasDriversLicense ? "Driver’s License" : null,
  ].filter((item): item is string => Boolean(item));

  const isSurveyReady = missingSurveyItems.length === 0;
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
      printHref: skillsPrintHref,
      printLabel: skillsPrintMeta.label,
      showPrint: skillsPrintMeta.canPrint,
    },
    {
      label: "Performance Evaluation",
      value: performanceState.label,
      tone: performanceState.tone,
      progress:
        performanceProgress.total > 0
          ? `${performanceProgress.percent}% complete`
          : "No progress yet",
      printHref: performancePrintHref,
      printLabel: performancePrintMeta.label,
      showPrint: performancePrintMeta.canPrint,
    },
    {
      label: "OIG Check",
      value: oigState.label,
      tone: oigState.tone,
      progress: oigEvent?.due_date ? `Due ${formatDate(oigEvent.due_date)}` : "No event yet",
      printHref: "",
      printLabel: "",
      showPrint: false,
    },
    {
      label: "Contract Review",
      value: contractState.label,
      tone: contractState.tone,
      progress: contractReviewEvent?.due_date
        ? `Due ${formatDate(contractReviewEvent.due_date)}`
        : "No event yet",
      printHref: "",
      printLabel: "",
      showPrint: false,
    },
    {
      label: "Annual Training",
      value: trainingState.label,
      tone: trainingState.tone,
      progress: trainingChecklistEvent?.due_date
        ? `Due ${formatDate(trainingChecklistEvent.due_date)}`
        : "No event yet",
      printHref: "",
      printLabel: "",
      showPrint: false,
    },
    {
      label: "Annual TB Statement",
      value: tbState.label,
      tone: tbState.tone,
      progress: tbStatementEvent?.due_date
        ? `Due ${formatDate(tbStatementEvent.due_date)}`
        : "No event yet",
      printHref: "",
      printLabel: "",
      showPrint: false,
    },
  ];

  const personnelFileAuditItems = [
    {
      label: "Application",
      status: isApplicationComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#application-section`,
    },
    {
      label: "Documents",
      status: isDocumentsComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#documents-section`,
    },
    {
      label: "Contracts",
      status: isContractsComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#contract-review-section`,
    },
    {
      label: "Training",
      status: isTrainingComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#training-checklist-section`,
    },
    {
      label: "Skills Competency",
      status: isSkillsComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}/forms/skills-competency`,
    },
    {
      label: "Performance Evaluation",
      status: isPerformanceComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}/forms/performance-evaluation`,
    },
    {
      label: "TB",
      status: isTbComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#tb-statement-section`,
    },
    {
      label: "OIG",
      status: isOigComplete ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#oig-section`,
    },
    {
      label: "Tax Form",
      status: isTaxFormSigned ? "Complete" : "Missing",
      href: `/admin/employees/${employeeId}#tax-forms-section`,
    },
    {
      label: "CPR Card",
      status: requiresCpr ? (hasCprCard ? "Complete" : "Missing") : "Not Required",
      href: `/admin/employees/${employeeId}#credentials-section`,
    },
    {
      label: "Driver’s License",
      status: requiresDriversLicense
        ? hasDriversLicense
          ? "Complete"
          : "Missing"
        : "Not Required",
      href: `/admin/employees/${employeeId}#credentials-section`,
    },
  ];

  const { data: historyEventsRaw } = await supabase
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
    .order("due_date", { ascending: false });

  const historyEvents = (historyEventsRaw || []) as ComplianceEvent[];

  const historyEventIds = historyEvents.map((event) => event.id);

  let historyForms: AdminFormRecord[] = [];
  if (historyEventIds.length > 0) {
    const { data: historyFormsRaw } = await supabase
      .from("employee_admin_forms")
      .select(
        "id, status, compliance_event_id, finalized_at, updated_at, form_data, form_type"
      )
      .eq("employee_id", employeeId)
      .in("compliance_event_id", historyEventIds)
      .in("form_type", ["skills_competency", "performance_evaluation"])
      .order("updated_at", { ascending: false });

    historyForms = (historyFormsRaw || []) as AdminFormRecord[];
  }

  const historyRows = historyEvents.map((event) => {
    const matchingForms = historyForms.filter(
      (form) => form.compliance_event_id === event.id
    );

    const form =
      matchingForms.find((item) => item.status === "finalized") ||
      matchingForms[0] ||
      null;

    const printMeta = getPrintMeta(form, event);
    const printHref = getHistoryPrintHref(employeeId, event, form);

    return {
      event,
      form,
      printMeta,
      printHref,
    };
  });

  return (
    <div className="space-y-6 p-6">
      <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-8">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-sky-100 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 shadow-sm">
                Saintly Admin Portal
              </div>

              <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
                {employee.first_name} {employee.last_name}
              </h1>

              <p className="mt-2 text-lg text-slate-500">{employee.email}</p>

              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${employeeStatusMeta.badgeClass}`}
                  >
                    {employeeStatusMeta.label}
                  </span>

                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
                      isSurveyReady ? "green" : "red"
                    )}`}
                  >
                    {isSurveyReady ? "Survey Ready" : "Not Ready"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                <form action={updateEmployeeStatus}>
                  <input type="hidden" name="status" value="onboarding" />
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                  >
                    Mark Onboarding
                  </button>
                </form>

                {missingCredentialTypes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                    >
                      Mark Active
                    </button>
                    <p className="text-xs font-medium text-red-700">
                      Cannot mark active until these credentials are added:{" "}
                      {missingCredentialTypes.map(formatCredentialType).join(", ")}
                    </p>
                  </div>
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

                <Link
                  href={`/admin/employees/${employeeId}/exit`}
                  className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Mark Inactive
                </Link>

                <a
                  href={`/admin/employees/${employeeId}/employee-file`}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Download Employee File
                </a>

                {isSurveyReady ? (
                  <a
                    href={`/admin/employees/${employeeId}/employee-file`}
                    className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-100"
                  >
                    Download Survey Packet
                  </a>
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
              </div>

              {!isSurveyReady ? (
                <p className="mt-3 text-xs text-slate-500">Missing: {surveyMissingSummary}</p>
              ) : null}

              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600">
                Annual compliance items are managed as separate event-based records so each
                year can be tracked, completed, printed, and retained without overwriting
                prior annual forms.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[860px]">
              <Link
                href={skillsHref}
                className={`inline-flex min-h-[72px] items-center justify-center rounded-[24px] px-6 py-4 text-center text-base font-semibold shadow-lg transition ${getButtonClasses(
                  skillsState.tone
                )}`}
              >
                {skillsState.buttonText} Skills Competency
              </Link>

              <Link
                href={performanceHref}
                className={`inline-flex min-h-[72px] items-center justify-center rounded-[24px] px-6 py-4 text-center text-base font-semibold shadow-lg transition ${getButtonClasses(
                  performanceState.tone
                )}`}
              >
                {performanceState.buttonText} Performance Evaluation
              </Link>

              <Link
                href={oigHref}
                className={`inline-flex min-h-[72px] items-center justify-center rounded-[24px] px-6 py-4 text-center text-base font-semibold shadow-lg transition ${getButtonClasses(
                  oigState.tone
                )}`}
              >
                {oigState.buttonText} OIG Check
              </Link>

              <Link
                href={contractHref}
                className={`inline-flex min-h-[72px] items-center justify-center rounded-[24px] px-6 py-4 text-center text-base font-semibold shadow-lg transition ${getButtonClasses(
                  contractState.tone
                )}`}
              >
                {contractState.buttonText} Contract Review
              </Link>

              <Link
                href={trainingHref}
                className={`inline-flex min-h-[72px] items-center justify-center rounded-[24px] px-6 py-4 text-center text-base font-semibold shadow-lg transition ${getButtonClasses(
                  trainingState.tone
                )}`}
              >
                {trainingState.buttonText} Annual Training
              </Link>

              <Link
                href={tbHref}
                className={`inline-flex min-h-[72px] items-center justify-center rounded-[24px] px-6 py-4 text-center text-base font-semibold shadow-lg transition ${getButtonClasses(
                  tbState.tone
                )}`}
              >
                {tbState.buttonText} TB Statement
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-100 bg-white p-6 md:grid-cols-2 xl:grid-cols-3">
          {complianceSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Current Status
              </p>

              <div className="mt-2 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.progress}</p>
                </div>

                <div className="flex items-center gap-2">
                  {item.showPrint ? (
                    <Link
                      href={item.printHref}
                      className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {item.printLabel}
                    </Link>
                  ) : null}

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
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
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <EventCard
          title="Skills Competency"
          subtitle="Annual clinical and discipline-specific competency tracking."
          href={skillsHref}
          printHref={skillsPrintHref}
          event={skillsEvent}
          form={skillsForm}
          progress={skillsProgress}
        />

        <EventCard
          title="Performance Evaluation"
          subtitle="Annual performance review with draft, finalize, and locked completion flow."
          href={performanceHref}
          printHref={performancePrintHref}
          event={performanceEvent}
          form={performanceForm}
          progress={performanceProgress}
        />
      </div>

      <div
        className={`rounded-[24px] border px-5 py-4 shadow-sm ${
          missingCredentialTypes.length > 0 || credentialSummary.expired > 0
            ? "border-red-200 bg-red-50 text-red-800"
            : credentialSummary.dueSoon > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-green-200 bg-green-50 text-green-800"
        }`}
      >
        <p className="text-sm font-semibold">
          {missingCredentialTypes.length > 0
            ? `Missing required credentials: ${missingCredentialTypes
                .map(formatCredentialType)
                .join(", ")}.`
            : credentialSummary.expired > 0
            ? `${credentialSummary.expired} credential${
                credentialSummary.expired === 1 ? "" : "s"
              } expired and need attention.`
            : credentialSummary.dueSoon > 0
              ? `${credentialSummary.dueSoon} credential${
                  credentialSummary.dueSoon === 1 ? "" : "s"
                } due within 30 days.`
              : "All credentials compliant."}
        </p>
        <p className="mt-1 text-xs font-medium opacity-80">
          {missingCredentialTypes.length > 0
            ? `${credentialSummary.expired} expired, ${credentialSummary.dueSoon} due soon, ${credentialSummary.active} active.`
            : credentialSummary.expired > 0
            ? `${credentialSummary.dueSoon} due soon, ${credentialSummary.active} active.`
            : credentialSummary.dueSoon > 0
              ? `${credentialSummary.active} active, no expired credentials.`
              : `${credentialSummary.active} active credential${
                  credentialSummary.active === 1 ? "" : "s"
                } on file.`}
        </p>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Personnel File Audit</h2>
            <p className="mt-1 text-sm text-slate-500">
              Quick pass/fail review for survey-safe file readiness.
            </p>
          </div>
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
              isSurveyReady ? "green" : "red"
            )}`}
          >
            {isSurveyReady ? "Complete" : "Needs Review"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {personnelFileAuditItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                {item.status === "Missing" ? (
                  <Link
                    href={item.href}
                    className="mt-1 inline-flex text-xs font-semibold text-sky-700 transition hover:text-sky-800"
                  >
                    Fix
                  </Link>
                ) : null}
              </div>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getBadgeClasses(
                  item.status === "Complete"
                    ? "green"
                    : item.status === "Missing"
                      ? "red"
                      : "slate"
                )}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <CredentialManager
        employeeId={employeeId}
        initialCredentials={employeeCredentials}
      />

      <EmployeeContractTaxSection
        applicantId={employeeId}
        employeeName={`${employee.first_name || ""} ${employee.last_name || ""}`.trim()}
        initialContract={employeeContract}
        suggestedRoleKey={suggestedContractRole}
        initialTaxForm={employeeTaxForm}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <SimpleComplianceCard
          id="oig-section"
          title="OIG Exclusion Check"
          subtitle="Annual exclusion screening tracking for survey-safe compliance review."
          event={oigEvent}
        />

        <SimpleComplianceCard
          id="contract-review-section"
          title="Contract Annual Review"
          subtitle="Annual contract review tracking for yearly compliance and retention."
          event={contractReviewEvent}
        />

        <SimpleComplianceCard
          id="training-checklist-section"
          title="Annual Training Checklist"
          subtitle="Annual training completion tracking for yearly staff compliance."
          event={trainingChecklistEvent}
        />

        <SimpleComplianceCard
          id="tb-statement-section"
          title="Annual TB Statement"
          subtitle="Annual TB statement tracking for employee health compliance."
          event={tbStatementEvent}
        />
      </div>

      <div id="event-management">
        <ComplianceEventManager
          employeeId={employeeId}
          skillsEvent={skillsEvent}
          performanceEvent={performanceEvent}
        />
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
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

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Admin Guidance</h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">1. Start from the current event</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Admin staff should always enter forms through the employee dashboard so the
              correct annual event is used.
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">2. Draft before finalize</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Draft status protects in-progress work. Finalize should only happen after the
              live review is fully complete and survey-safe.
            </p>
          </div>

          <div className="rounded-[22px] border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">3. Preserve annual history</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Each annual cycle should create a fresh event so prior-year performance and
              competency records stay intact for CHAP and audit review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
