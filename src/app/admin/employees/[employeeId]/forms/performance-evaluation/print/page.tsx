import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { performanceEvaluationDisciplines } from "@/lib/performance-evaluation";
import PrintButton from "@/components/admin/print-button";

type PageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ eventId?: string }>;
};

type ComplianceEvent = {
  id: string;
  event_title: string | null;
  due_date: string | null;
  completed_at: string | null;
  status: string | null;
};

type AdminFormRecord = {
  id: string;
  status: string | null;
  finalized_at: string | null;
  compliance_event_id: string | null;
  form_data: {
    discipline?: string;
    employee_name?: string;
    evaluator_name?: string;
    evaluation_date?: string;
    notes?: string;
    items?: Record<string, string>;
  } | null;
};

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString?: string | null) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRatingLabel(selectedDiscipline: any, value?: string) {
  if (!value) return "Not scored";

  const match = selectedDiscipline?.scaleOptions?.find(
    (option: { value: string; label: string }) => option.value === value
  );

  return match ? `${value} — ${match.label}` : value;
}

export default async function PerformanceEvaluationPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { employeeId } = await params;
  const { eventId } = await searchParams;

  if (!employeeId) {
    return <div className="p-6">Invalid employee ID</div>;
  }

  const { data: employee } = await supabase
    .from("applicants")
    .select("id, first_name, last_name, email")
    .eq("id", employeeId)
    .single();

  if (!employee) {
    return <div className="p-6">Employee not found</div>;
  }

  let resolvedEvent: ComplianceEvent | null = null;

  if (eventId) {
    const { data } = await supabase
      .from("admin_compliance_events")
      .select("id, event_title, due_date, completed_at, status")
      .eq("id", eventId)
      .maybeSingle();

    resolvedEvent = data;
  } else {
    const { data } = await supabase
      .from("admin_compliance_events")
      .select("id, event_title, due_date, completed_at, status")
      .eq("applicant_id", employeeId)
      .eq("event_type", "annual_performance_evaluation")
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    resolvedEvent = data;
  }

  let formQuery = supabase
    .from("employee_admin_forms")
    .select("id, status, finalized_at, compliance_event_id, form_data")
    .eq("employee_id", employeeId)
    .eq("form_type", "performance_evaluation");

  if (resolvedEvent?.id) {
    formQuery = formQuery.eq("compliance_event_id", resolvedEvent.id);
  } else {
    formQuery = formQuery.is("compliance_event_id", null);
  }

  const { data: form } = await formQuery
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AdminFormRecord>();

  if (!form) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-4xl rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Performance Evaluation Print View
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            No saved performance evaluation was found for this employee and annual event.
          </p>

          <div className="mt-6">
            <Link
              href={`/admin/employees/${employeeId}/forms/performance-evaluation${
                resolvedEvent?.id ? `?eventId=${resolvedEvent.id}` : ""
              }`}
              className="inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Return to Performance Evaluation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const formData = form.form_data || {};
  const selectedDiscipline =
    performanceEvaluationDisciplines.find(
      (discipline) =>
        discipline.id === String(formData.discipline || "").toLowerCase()
    ) || performanceEvaluationDisciplines[0];

  const items = selectedDiscipline?.items || [];
  const answeredItems = formData.items || {};
  const completedCount = items.filter((item) => !!answeredItems[item.id]).length;
  const totalCount = items.length;
  const percent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 print:bg-white print:p-0">
      <div className="mx-auto max-w-5xl space-y-6 print:max-w-none print:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href={`/admin/employees/${employeeId}/forms/performance-evaluation${
              resolvedEvent?.id ? `?eventId=${resolvedEvent.id}` : ""
            }`}
            className="inline-flex rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm"
          >
            Back to Form
          </Link>

          <PrintButton />
        </div>

        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-8 py-8 print:bg-white">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Saintly Home Health
                </div>

                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
                  Annual Performance Evaluation
                </h1>

                <p className="mt-2 text-sm text-slate-600">
                  Print-ready annual performance record for compliance review, personnel
                  file retention, and survey documentation.
                </p>
              </div>

              <div className="text-right">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <div className="text-slate-500">Form Status</div>
                  <div className="font-semibold capitalize text-slate-900">
                    {form.status || "draft"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-8 py-8 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Employee
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formData.employee_name ||
                  `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
                  "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Evaluator
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formData.evaluator_name || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Discipline
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {selectedDiscipline?.label || "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Evaluation Date
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formatDate(formData.evaluation_date)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Annual Event
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {resolvedEvent?.event_title || "Performance Evaluation"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Due Date
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formatDate(resolvedEvent?.due_date)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Finalized
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formatDateTime(form.finalized_at || resolvedEvent?.completed_at)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Completion
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {percent}% ({completedCount}/{totalCount})
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 px-8 py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-slate-900">Responsibilities / Duties</h2>
              <p className="text-sm text-slate-500">
                Scale:{" "}
                {selectedDiscipline?.scaleOptions?.length
                  ? selectedDiscipline.scaleOptions
                      .map(
                        (option: { value: string; label: string }) =>
                          `${option.value} = ${option.label}`
                      )
                      .join(" • ")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200">
            {items.length === 0 ? (
              <div className="px-8 py-8 text-sm text-slate-500">
                No performance items were found for this discipline.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid gap-4 px-8 py-5 md:grid-cols-[64px_1fr_280px] md:items-start"
                  >
                    <div className="text-sm font-semibold text-slate-400">
                      {String(index + 1).padStart(2, "0")}
                    </div>

                    <div>
                      <div className="text-sm font-medium leading-6 text-slate-900">
                        {item.label}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                      {getRatingLabel(selectedDiscipline, answeredItems[item.id])}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-8 py-6">
            <h2 className="text-lg font-bold text-slate-900">Evaluator Notes</h2>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              {formData.notes?.trim() ? formData.notes : "No evaluator notes documented."}
            </div>
          </div>

          <div className="border-t border-slate-200 px-8 py-6">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Employee Signature / Acknowledgment
                </div>
                <div className="mt-12 border-b border-slate-400" />
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Evaluator Signature
                </div>
                <div className="mt-12 border-b border-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}