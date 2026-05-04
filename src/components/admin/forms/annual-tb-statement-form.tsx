"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

type Props = {
  employeeId: string;
  complianceEventId?: string | null;
  startNewVersion?: boolean;
};

type TbFormState = {
  statement_date: string;
  screening_result: "negative" | "positive" | "pending";
  symptom_review_completed: boolean;
  notes: string;
  reviewed_by: string;
};

type FormHistoryRow = {
  id: string;
  status: "draft" | "finalized" | null;
  compliance_event_id?: string | null;
  finalized_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  form_data?: TbFormState | null;
};

type EventRow = {
  id: string;
  event_title?: string | null;
  due_date?: string | null;
  status?: string | null;
  completed_at?: string | null;
};

const DEFAULT_FORM: TbFormState = {
  statement_date: new Date().toISOString().slice(0, 10),
  screening_result: "pending",
  symptom_review_completed: false,
  notes: "",
  reviewed_by: "",
};

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

export default function AnnualTbStatementForm({
  employeeId,
  complianceEventId,
  startNewVersion = false,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeeName, setEmployeeName] = useState("Employee");
  const [event, setEvent] = useState<EventRow | null>(null);

  const [recordId, setRecordId] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [form, setForm] = useState<TbFormState>(DEFAULT_FORM);
  const [history, setHistory] = useState<FormHistoryRow[]>([]);

  async function loadHistory() {
    let query = supabase
      .from("employee_admin_forms")
      .select("id, status, compliance_event_id, finalized_at, created_at, updated_at, form_data")
      .eq("employee_id", employeeId)
      .eq("form_type", "annual_tb_statement")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (complianceEventId) {
      query = query.eq("compliance_event_id", complianceEventId);
    } else {
      query = query.is("compliance_event_id", null);
    }

    const { data, error: historyError } = await query;
    if (historyError) throw historyError;

    const rows = (data || []) as FormHistoryRow[];
    setHistory(rows);

    if (rows.length > 0) {
      const latest = rows[0];
      setRecordId(latest.id);
      setStatus(latest.status === "finalized" ? "finalized" : "draft");
      setForm({ ...DEFAULT_FORM, ...(latest.form_data || {}) });
    } else {
      setRecordId(null);
      setStatus("draft");
      setForm(DEFAULT_FORM);
    }
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [{ data: employee }, { data: eventRow }] = await Promise.all([
          supabase.from("applicants").select("first_name, last_name").eq("id", employeeId).single(),
          complianceEventId
            ? supabase
                .from("admin_compliance_events")
                .select("id, event_title, due_date, status, completed_at")
                .eq("id", complianceEventId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (!alive) return;

        const first = (employee as { first_name?: string | null } | null)?.first_name || "";
        const last = (employee as { last_name?: string | null } | null)?.last_name || "";
        const name = `${first} ${last}`.trim();
        setEmployeeName(name || "Employee");
        setEvent((eventRow || null) as EventRow | null);

        await loadHistory();

        if (startNewVersion) {
          setRecordId(null);
          setStatus("draft");
        }
      } catch (err: unknown) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load form.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [employeeId, complianceEventId, startNewVersion]);

  const completed = useMemo(
    () =>
      [form.statement_date, form.reviewed_by].every(
        (value) => typeof value === "string" && value.trim().length > 0
      ) && form.symptom_review_completed,
    [form]
  );

  async function save(nextStatus: "draft" | "finalized") {
    if (nextStatus === "finalized" && !completed) {
      setError("Complete required fields before finalizing.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      employee_id: employeeId,
      compliance_event_id: complianceEventId ?? null,
      form_type: "annual_tb_statement",
      form_title: "Annual TB Statement",
      status: nextStatus,
      finalized_at: nextStatus === "finalized" ? new Date().toISOString() : null,
      form_data: form,
    };

    try {
      const { data, error: insertError } = await supabase
        .from("employee_admin_forms")
        .insert(payload)
        .select("id")
        .single();

      if (insertError) throw insertError;
      setRecordId(data.id);
      setStatus(nextStatus);

      if (nextStatus === "finalized" && complianceEventId) {
        await supabase
          .from("admin_compliance_events")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", complianceEventId);
      }

      await loadHistory();
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
      <div className="overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50 shadow-[0_20px_60px_-25px_rgba(2,132,199,0.35)]">
        <div className="border-b border-sky-100 px-6 py-5 md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Saintly Annual Compliance
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                Annual TB Statement
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Complete yearly TB attestation, save progress, then finalize the annual statement.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
                {employeeName}
              </span>
              <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
                {status === "finalized" ? "Finalized" : "Draft"}
              </span>
              {complianceEventId ? (
                <span className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
                  Event Linked
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6 md:px-8">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Statement Date
              </label>
              <input
                type="date"
                value={form.statement_date}
                onChange={(e) => setForm((prev) => ({ ...prev, statement_date: e.target.value }))}
                disabled={status === "finalized"}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Screening Result
              </label>
              <select
                value={form.screening_result}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    screening_result: e.target.value as TbFormState["screening_result"],
                  }))
                }
                disabled={status === "finalized"}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              >
                <option value="pending">Pending</option>
                <option value="negative">Negative</option>
                <option value="positive">Positive</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.symptom_review_completed}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, symptom_review_completed: e.target.checked }))
                }
                disabled={status === "finalized"}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Symptom/risk review completed
            </label>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              Reviewed By
            </label>
            <input
              type="text"
              value={form.reviewed_by}
              onChange={(e) => setForm((prev) => ({ ...prev, reviewed_by: e.target.value }))}
              disabled={status === "finalized"}
              placeholder="Nurse or admin reviewer name"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              disabled={status === "finalized"}
              rows={4}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving || status === "finalized"}
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
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

          {event ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">Linked Event:</span>{" "}
                {event.event_title || "Annual TB Statement"}
              </p>
              <p className="mt-1">
                Due: {formatDateTime(event.due_date)} | Status: {event.status || "pending"}
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Version History</h2>
        <div className="mt-4 space-y-3">
          {history.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No annual TB statement history yet.
            </div>
          ) : (
            history.map((item, index) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {index === 0 ? "Current" : "Prior"} · {item.status || "draft"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Updated {formatDateTime(item.updated_at || item.created_at)}{" "}
                    {item.finalized_at ? `· Finalized ${formatDateTime(item.finalized_at)}` : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {recordId ? (
        <div className="text-xs text-slate-500">Record ID: {recordId}</div>
      ) : null}
    </div>
  );
}

