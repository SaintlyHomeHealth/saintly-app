"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { applicantRolePrimaryForCompliance } from "@/lib/applicant-role-for-compliance";
import { supabase } from "@/lib/supabase";
import { performanceEvaluationDisciplines } from "@/lib/performance-evaluation";
import type { CompetencyDiscipline } from "@/lib/skills-competency/types";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

type Props = {
  employeeId: string;
  complianceEventId?: string | null;
  startNewVersion?: boolean;
};

type FormState = {
  discipline: string;
  employee_name: string;
  evaluator_name: string;
  evaluation_date: string;
  goals: string;
  comments: string;
  items: Record<string, string>;
};

type ApplicantPrefillRecord = {
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  primary_discipline?: string | null;
  type_of_position?: string | null;
};

type AdminFormHistoryRow = {
  id: string;
  status: "draft" | "finalized" | null;
  compliance_event_id?: string | null;
  finalized_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function getDefaultState(): FormState {
  return {
    discipline: "hha",
    employee_name: "",
    evaluator_name: "",
    evaluation_date: new Date().toISOString().slice(0, 10),
    goals: "",
    comments: "",
    items: {},
  };
}

function toDateInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function getApplicantRoleValue(applicant?: ApplicantPrefillRecord | null) {
  if (!applicant) return "";
  return applicantRolePrimaryForCompliance(applicant);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return formatAppDateTime(value, value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFormStatusLabel(status?: "draft" | "finalized" | null, isCurrent = false) {
  if (!isCurrent) return "Superseded";
  return status === "finalized" ? "Finalized" : "Draft";
}

function getFormStatusClasses(status?: "draft" | "finalized" | null, isCurrent = false) {
  if (!isCurrent) return "bg-slate-100 text-slate-700";

  return status === "finalized"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-amber-50 text-amber-700";
}

export default function PerformanceEvaluationForm({
  employeeId,
  complianceEventId,
  startNewVersion = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [form, setForm] = useState<FormState>(getDefaultState());
  const [formHistory, setFormHistory] = useState<AdminFormHistoryRow[]>([]);

  const normalizedDiscipline = (form.discipline || "").toLowerCase();

  const selectedDiscipline: CompetencyDiscipline = useMemo(
    () =>
      performanceEvaluationDisciplines.find(
        (d) => d.id === normalizedDiscipline
      ) || performanceEvaluationDisciplines[0],
    [normalizedDiscipline]
  );

  const scoreSummary = useMemo(() => {
    const total = selectedDiscipline.items.length;

    if (!total) {
      return { completed: 0, total: 0, percent: 0 };
    }

    const completed = selectedDiscipline.items.filter(
      (item) => !!form.items[item.id]
    ).length;

    const percent = Math.round((completed / total) * 100);

    return { completed, total, percent };
  }, [selectedDiscipline, form.items]);

  const printHref = complianceEventId
    ? `/admin/employees/${employeeId}/forms/performance-evaluation/print?eventId=${complianceEventId}`
    : `/admin/employees/${employeeId}/forms/performance-evaluation/print`;
  const activeHistoryRecord =
    startNewVersion
      ? null
      : formHistory.find((item) => item.id === recordId) ||
        formHistory.find(
          (item) => item.compliance_event_id === (complianceEventId ?? null)
        ) ||
        formHistory[0] ||
        null;
  const activeVersionNumber = activeHistoryRecord
    ? formHistory.length - formHistory.findIndex((item) => item.id === activeHistoryRecord.id)
    : null;

  const loadFormHistory = useCallback(async () => {
    const { data } = await supabase
      .from("employee_admin_forms")
      .select("id, status, compliance_event_id, finalized_at, created_at, updated_at")
      .eq("employee_id", employeeId)
      .eq("form_type", "performance_evaluation")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    setFormHistory((data || []) as AdminFormHistoryRow[]);
  }, [employeeId]);

  useEffect(() => {
    async function loadExisting() {
      setLoading(true);

      let query = supabase
        .from("employee_admin_forms")
        .select("id, status, form_data, compliance_event_id")
        .eq("employee_id", employeeId)
        .eq("form_type", "performance_evaluation")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (complianceEventId) {
        query = query.eq("compliance_event_id", complianceEventId);
      } else {
        query = query.is("compliance_event_id", null);
      }

      const formResultPromise = startNewVersion
        ? Promise.resolve({ data: null, error: null })
        : query.maybeSingle();

      const [formResult, applicantResult, eventResult] = await Promise.all([
        formResultPromise,
        supabase
          .from("applicants")
          .select(
            "first_name, last_name, position, primary_discipline, type_of_position"
          )
          .eq("id", employeeId)
          .maybeSingle<ApplicantPrefillRecord>(),
        complianceEventId
          ? supabase
              .from("admin_compliance_events")
              .select("due_date, completed_at")
              .eq("id", complianceEventId)
              .maybeSingle<{ due_date?: string | null; completed_at?: string | null }>()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const { data, error } = formResult;

      if (!error && data) {
        setRecordId(data.id);
        setStatus(data.status || "draft");
      } else {
        setRecordId(null);
        setStatus("draft");
      }

      const applicant = applicantResult.data;
      const linkedEvent = eventResult.data;
      const fullName =
        `${applicant?.first_name || ""} ${applicant?.last_name || ""}`.trim();
      const roleValue = getApplicantRoleValue(applicant);
      const savedData = data?.form_data || null;
      const fallbackDiscipline = mapPositionToDiscipline(roleValue);
      const fallbackEvaluationDate =
        toDateInputValue(linkedEvent?.completed_at) ||
        toDateInputValue(linkedEvent?.due_date) ||
        new Date().toISOString().slice(0, 10);

      setForm({
        discipline: (
          savedData?.discipline ||
          fallbackDiscipline ||
          getDefaultState().discipline
        ).toLowerCase(),
        employee_name: savedData?.employee_name || fullName || "",
        evaluator_name: savedData?.evaluator_name || "",
        evaluation_date:
          savedData?.evaluation_date ||
          fallbackEvaluationDate ||
          getDefaultState().evaluation_date,
        goals: savedData?.goals || "",
        comments: savedData?.comments || "",
        items: savedData?.items || {},
      });

      await loadFormHistory();
      setLoading(false);
    }

    loadExisting();
  }, [employeeId, complianceEventId, startNewVersion, loadFormHistory]);

  function mapPositionToDiscipline(position: string) {
    const p = position.toLowerCase();

    if (p.includes("alternate administrator")) return "alternate_admin";
    if (p.includes("administrator")) return "administrator";
    if (p.includes("pediatric") && p.includes("rn")) return "pediatric_rn";
    if (p.includes("cna") || p.includes("hha")) return "hha";
    if (p.includes("physical therapist assistant") || p.includes("pta")) {
      return "pta";
    }
    if (p.includes("physical therapist") || p === "pt") {
      return "pt";
    }
    if (p.includes("occupational therapist assistant") || p.includes("ota")) {
      return "ota";
    }
    if (p.includes("occupational therapist") || p === "ot") {
      return "ot";
    }
    if (p.includes("speech")) return "st";
    if (p.includes("social work assistant")) return "msw_assistant";
    if (p.includes("social worker") || p.includes("msw")) return "msw";
    if (p.includes("registered nurse") || p === "rn") return "rn";
    return "hha";
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (status === "finalized") return;
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateItem(itemId: string, value: string) {
    if (status === "finalized") return;
    setForm((prev) => ({
      ...prev,
      items: {
        ...prev.items,
        [itemId]: value,
      },
    }));
  }

  async function save(nextStatus: "draft" | "finalized") {
    setSaving(true);
    setError(null);

    const payload = {
      employee_id: employeeId,
      compliance_event_id: complianceEventId ?? null,
      form_type: "performance_evaluation",
      form_title: "Performance Evaluation",
      status: nextStatus,
      finalized_at: nextStatus === "finalized" ? new Date().toISOString() : null,
      form_data: form,
    };

    try {
      if (recordId) {
        const { error } = await supabase
          .from("employee_admin_forms")
          .update({
            status: nextStatus,
            finalized_at: nextStatus === "finalized" ? new Date().toISOString() : null,
            form_data: form,
            form_title: "Performance Evaluation",
            form_type: "performance_evaluation",
          })
          .eq("id", recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("employee_admin_forms")
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        setRecordId(data.id);
      }

      if (nextStatus === "finalized" && complianceEventId) {
        await supabase
          .from("admin_compliance_events")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", complianceEventId);
      }

      setStatus(nextStatus);
      await loadFormHistory();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save form.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-[0_20px_60px_-25px_rgba(14,165,233,0.35)]">
        <div className="border-b border-sky-100 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Saintly Performance Evaluation
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {selectedDiscipline.formTitle}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Complete the annual evaluation, save progress, then finalize when complete.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <span className="text-slate-500">Completed: </span>
                  <span className="font-semibold text-slate-900">
                    {scoreSummary.completed}/{scoreSummary.total}
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <span className="text-slate-500">Progress: </span>
                  <span className="font-semibold text-slate-900">
                    {scoreSummary.percent}%
                  </span>
                </div>

                {complianceEventId ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                    <span className="text-slate-500">Annual Event Linked</span>
                  </div>
                ) : null}

                {recordId ? (
                  <Link
                    href={printHref}
                    className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                  >
                    Print / Save PDF
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="text-slate-500">Status: </span>
              <span className="font-semibold capitalize text-slate-900">
                {status}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 pt-6 md:px-8">
          <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Current Record
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                Performance Evaluation
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Version
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {activeVersionNumber ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Status
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getFormStatusClasses(
                    activeHistoryRecord?.status || status,
                    true
                  )}`}
                >
                  {getFormStatusLabel(activeHistoryRecord?.status || status, true)}
                </span>
                {activeHistoryRecord ? (
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
                {formatDateTime(activeHistoryRecord?.created_at)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Completed
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {formatDateTime(activeHistoryRecord?.finalized_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-4 md:px-8">
          <Field
            label="Discipline"
            value={form.discipline}
            onChange={(value) => updateField("discipline", value.toLowerCase())}
            isSelect
            disabled={status === "finalized"}
            options={performanceEvaluationDisciplines.map((d) => ({
              value: d.id,
              label: d.label,
            }))}
          />
          <Field
            label={selectedDiscipline.employeeLabel}
            value={form.employee_name}
            onChange={(value) => updateField("employee_name", value)}
            disabled={status === "finalized"}
          />
          <Field
            label={selectedDiscipline.evaluatorLabel}
            value={form.evaluator_name}
            onChange={(value) => updateField("evaluator_name", value)}
            disabled={status === "finalized"}
          />
          <Field
            label="Evaluation Date"
            type="date"
            value={form.evaluation_date}
            onChange={(value) => updateField("evaluation_date", value)}
            disabled={status === "finalized"}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 md:px-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              Responsibilities / Duties
            </h2>
            <p className="text-sm text-slate-500">
              Scale:{" "}
              {selectedDiscipline.scaleOptions
                .map((s) => `${s.value} = ${s.label}`)
                .join(" • ")}
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {selectedDiscipline.items.length === 0 ? (
            <div className="px-6 py-6 text-sm text-slate-500 md:px-8">
              This discipline shell is ready. We can load its full evaluation next.
            </div>
          ) : (
            selectedDiscipline.items.map((item, index) => (
              <div
                key={item.id}
                className="grid gap-4 px-6 py-5 md:grid-cols-[60px_1fr_220px] md:items-center md:px-8"
              >
                <div className="text-sm font-semibold text-slate-400">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="text-sm font-medium text-slate-900">
                  {item.label}
                </div>

                <select
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                  value={form.items[item.id] || ""}
                  onChange={(e) => updateItem(item.id, e.target.value)}
                  disabled={status === "finalized"}
                >
                  <option value="">Select rating</option>
                  {selectedDiscipline.scaleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value} — {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-6 px-6 py-6 md:grid-cols-2 md:px-8">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Goals
            </label>
            <textarea
              value={form.goals}
              onChange={(e) => updateField("goals", e.target.value)}
              className="min-h-[180px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
              placeholder="Annual goals, improvement plan, objectives..."
              disabled={status === "finalized"}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Comments
            </label>
            <textarea
              value={form.comments}
              onChange={(e) => updateField("comments", e.target.value)}
              className="min-h-[180px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
              placeholder="Supervisor comments, follow-up notes, action items..."
              disabled={status === "finalized"}
            />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-600">
              {error ? (
                <span className="font-medium text-rose-600">{error}</span>
              ) : (
                <span>
                  Save as draft anytime. Finalize when the annual evaluation is complete.
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {recordId ? (
                <Link
                  href={printHref}
                  className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Print / Save PDF
                </Link>
              ) : null}

              <button
                type="button"
                onClick={() => save("draft")}
                disabled={saving || status === "finalized"}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Draft"}
              </button>

              <button
                type="button"
                onClick={() => save("finalized")}
                disabled={saving || status === "finalized"}
                className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : status === "finalized" ? "Finalized" : "Finalize"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Performance Version History</h3>
        </div>

        <div className="mt-4 space-y-3">
          {formHistory.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No performance evaluation history yet.
            </div>
          ) : (
            formHistory.map((historyItem, index) => {
              const isCurrent = historyItem.id === activeHistoryRecord?.id;
              const versionNumber = formHistory.length - index;
              const historyPrintHref = historyItem.compliance_event_id
                ? `/admin/employees/${employeeId}/forms/performance-evaluation/print?eventId=${historyItem.compliance_event_id}`
                : `/admin/employees/${employeeId}/forms/performance-evaluation/print`;

              return (
                <div
                  key={historyItem.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Version
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {versionNumber}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Record
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          Performance Evaluation
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Status
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getFormStatusClasses(
                              historyItem.status,
                              isCurrent
                            )}`}
                          >
                            {getFormStatusLabel(historyItem.status, isCurrent)}
                          </span>
                          {isCurrent ? (
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
                          {formatDateTime(historyItem.created_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Completed
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {formatDateTime(historyItem.finalized_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={historyPrintHref}
                        className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        Print / Save PDF
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  isSelect = false,
  disabled = false,
  options = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  isSelect?: boolean;
  disabled?: boolean;
  options?: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {isSelect ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
        />
      )}
    </div>
  );
}
