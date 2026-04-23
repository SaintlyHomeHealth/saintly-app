"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type EventRecord = {
  id: string;
  event_title: string | null;
  due_date: string | null;
  status: string | null;
  completed_at?: string | null;
};

type Props = {
  employeeId: string;
  skillsEvent?: EventRecord | null;
  performanceEvent?: EventRecord | null;
  trainingEvent?: EventRecord | null;
  contractReviewEvent?: EventRecord | null;
  tbStatementEvent?: EventRecord | null;
  /** Dense table layout for employee compliance section */
  presentation?: "default" | "compact";
};

function getNextYearDateString() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Matches employee page: completed_at or status completed/complete (case-insensitive). */
function isAnnualEventCompleted(event: EventRecord) {
  if (event.completed_at) return true;
  const s = (event.status || "").toLowerCase().trim();
  return s === "completed" || s === "complete";
}

function AnnualEventStatusRow({ event }: { event: EventRecord }) {
  if (isAnnualEventCompleted(event)) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
          Completed
        </span>
      </div>
    );
  }
  return (
    <p className="mt-1 text-sm text-slate-500">
      Status: {(event.status || "pending").replaceAll("_", " ")}
    </p>
  );
}

function CompactAnnualStatus({ event }: { event: EventRecord | null | undefined }) {
  if (!event) return <span className="text-xs text-slate-500">No event</span>;
  if (isAnnualEventCompleted(event)) {
    return (
      <span className="inline-flex rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-800">
        Completed
      </span>
    );
  }
  return (
    <span className="text-[11px] capitalize text-slate-600">
      {(event.status || "pending").replaceAll("_", " ")}
    </span>
  );
}

export default function ComplianceEventManager({
  employeeId,
  skillsEvent,
  performanceEvent,
  trainingEvent,
  contractReviewEvent,
  tbStatementEvent,
  presentation = "default",
}: Props) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [skillsDueDate, setSkillsDueDate] = useState(
    skillsEvent?.due_date?.slice(0, 10) || getNextYearDateString()
  );
  const [performanceDueDate, setPerformanceDueDate] = useState(
    performanceEvent?.due_date?.slice(0, 10) || getNextYearDateString()
  );
  const [trainingDueDate, setTrainingDueDate] = useState(
    trainingEvent?.due_date?.slice(0, 10) || getNextYearDateString()
  );
  const [contractReviewDueDate, setContractReviewDueDate] = useState(
    contractReviewEvent?.due_date?.slice(0, 10) || getNextYearDateString()
  );
  const [tbStatementDueDate, setTbStatementDueDate] = useState(
    tbStatementEvent?.due_date?.slice(0, 10) || getNextYearDateString()
  );

  const nextYear = useMemo(() => {
    const d = new Date();
    return d.getFullYear() + 1;
  }, []);
  const trainingStatus = (trainingEvent?.status || "").toLowerCase().trim();
  const hasOpenTrainingEvent = Boolean(
    trainingEvent &&
      !trainingEvent.completed_at &&
      trainingStatus !== "completed" &&
      trainingStatus !== "complete"
  );
  const contractReviewStatus = (contractReviewEvent?.status || "").toLowerCase().trim();
  const hasOpenContractReviewEvent = Boolean(
    contractReviewEvent &&
      !contractReviewEvent.completed_at &&
      contractReviewStatus !== "completed" &&
      contractReviewStatus !== "complete"
  );
  const tbStatus = (tbStatementEvent?.status || "").toLowerCase().trim();
  const hasOpenTbStatementEvent = Boolean(
    tbStatementEvent &&
      !tbStatementEvent.completed_at &&
      tbStatus !== "completed" &&
      tbStatus !== "complete"
  );

  async function createEvent(
    eventType:
      | "skills_checklist"
      | "annual_performance_evaluation"
      | "annual_training"
      | "annual_contract_review"
      | "annual_tb_statement"
  ) {
    setSaving(true);
    setError(null);
    setMessage(null);

    const dueDate =
      eventType === "skills_checklist"
        ? skillsDueDate
        : eventType === "annual_performance_evaluation"
          ? performanceDueDate
          : eventType === "annual_training"
            ? trainingDueDate
            : eventType === "annual_contract_review"
              ? contractReviewDueDate
              : tbStatementDueDate;

    const title =
      eventType === "skills_checklist"
        ? `Skills Competency ${new Date(dueDate).getFullYear()}`
        : eventType === "annual_performance_evaluation"
          ? `Performance Evaluation ${new Date(dueDate).getFullYear()}`
          : eventType === "annual_training"
            ? `Annual Training Checklist ${new Date(dueDate).getFullYear()}`
            : eventType === "annual_contract_review"
              ? `Contract Annual Review ${new Date(dueDate).getFullYear()}`
              : `Annual TB Statement ${new Date(dueDate).getFullYear()}`;

    try {
      const { error } = await supabase.from("admin_compliance_events").insert({
        applicant_id: employeeId,
        event_type: eventType,
        event_title: title,
        due_date: dueDate,
        status: "pending",
        completed_at: null,
      });

      if (error) throw error;

      setMessage(
        eventType === "skills_checklist"
          ? "New Skills annual event created."
          : eventType === "annual_performance_evaluation"
            ? "New Performance annual event created."
            : eventType === "annual_training"
              ? "New Training annual event created."
              : eventType === "annual_contract_review"
                ? "New Contract annual event created."
                : "New TB statement annual event created."
      );

      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to create annual event.");
    } finally {
      setSaving(false);
    }
  }

  async function updateDueDate(eventId: string, dueDate: string, label: string) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("admin_compliance_events")
        .update({ due_date: dueDate })
        .eq("id", eventId);

      if (error) throw error;

      setMessage(`${label} due date updated.`);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to update due date.");
    } finally {
      setSaving(false);
    }
  }

  if (presentation === "compact") {
    const dateInputClass =
      "w-full max-w-[11rem] rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-900";
    const btnSecondary =
      "mt-1 block w-full max-w-[11rem] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
    const btnCreate =
      "rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50";

    return (
      <div className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-2 py-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
            Annual event management
          </p>
          <p className="text-[11px] text-slate-500">
            Set due dates, open current events, or create the next cycle ({nextYear}).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-1 font-semibold">Event type</th>
                <th className="px-2 py-1 font-semibold">Current record</th>
                <th className="px-2 py-1 font-semibold">Due date</th>
                <th className="px-2 py-1 pr-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs font-medium text-slate-900">
                  Skills Competency
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs">
                  {skillsEvent ? (
                    <>
                      <div className="font-medium text-slate-800">
                        {skillsEvent.event_title || "—"}
                      </div>
                      <div className="mt-0.5">
                        <CompactAnnualStatus event={skillsEvent} />
                      </div>
                      <Link
                        href={`/admin/employees/${employeeId}/forms/skills-competency?eventId=${skillsEvent.id}`}
                        className="mt-0.5 inline-block text-[11px] font-semibold text-sky-800 underline"
                      >
                        Open
                      </Link>
                    </>
                  ) : (
                    <CompactAnnualStatus event={skillsEvent} />
                  )}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5">
                  <input
                    type="date"
                    value={skillsDueDate}
                    onChange={(e) => setSkillsDueDate(e.target.value)}
                    className={dateInputClass}
                  />
                  {skillsEvent ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => updateDueDate(skillsEvent.id, skillsDueDate, "Skills event")}
                      className={btnSecondary}
                    >
                      Update due
                    </button>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => createEvent("skills_checklist")}
                    className={btnCreate}
                  >
                    Create
                  </button>
                </td>
              </tr>
              <tr className="align-top">
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs font-medium text-slate-900">
                  Performance Evaluation
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs">
                  {performanceEvent ? (
                    <>
                      <div className="font-medium text-slate-800">
                        {performanceEvent.event_title || "—"}
                      </div>
                      <div className="mt-0.5">
                        <CompactAnnualStatus event={performanceEvent} />
                      </div>
                      <Link
                        href={`/admin/employees/${employeeId}/forms/performance-evaluation?eventId=${performanceEvent.id}`}
                        className="mt-0.5 inline-block text-[11px] font-semibold text-sky-800 underline"
                      >
                        Open
                      </Link>
                    </>
                  ) : (
                    <CompactAnnualStatus event={performanceEvent} />
                  )}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5">
                  <input
                    type="date"
                    value={performanceDueDate}
                    onChange={(e) => setPerformanceDueDate(e.target.value)}
                    className={dateInputClass}
                  />
                  {performanceEvent ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        updateDueDate(performanceEvent.id, performanceDueDate, "Performance event")
                      }
                      className={btnSecondary}
                    >
                      Update due
                    </button>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => createEvent("annual_performance_evaluation")}
                    className={btnCreate}
                  >
                    Create
                  </button>
                </td>
              </tr>
              <tr className="align-top">
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs font-medium text-slate-900">
                  Annual Training
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs">
                  {trainingEvent ? (
                    <>
                      <div className="font-medium text-slate-800">
                        {trainingEvent.event_title || "—"}
                      </div>
                      <div className="mt-0.5">
                        <CompactAnnualStatus event={trainingEvent} />
                      </div>
                      <Link
                        href={`/admin/employees/${employeeId}/forms/annual-training-checklist?eventId=${trainingEvent.id}`}
                        className="mt-0.5 inline-block text-[11px] font-semibold text-sky-800 underline"
                      >
                        Open
                      </Link>
                    </>
                  ) : (
                    <CompactAnnualStatus event={trainingEvent} />
                  )}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5">
                  <input
                    type="date"
                    value={trainingDueDate}
                    onChange={(e) => setTrainingDueDate(e.target.value)}
                    className={dateInputClass}
                  />
                  {trainingEvent ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        updateDueDate(trainingEvent.id, trainingDueDate, "Training event")
                      }
                      className={btnSecondary}
                    >
                      Update due
                    </button>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={saving || hasOpenTrainingEvent}
                    onClick={() => createEvent("annual_training")}
                    className={btnCreate}
                  >
                    Create
                  </button>
                  {hasOpenTrainingEvent ? (
                    <p className="mt-1 max-w-[14rem] text-left text-[10px] text-amber-800">
                      Finish open event before creating another.
                    </p>
                  ) : null}
                </td>
              </tr>
              <tr className="align-top">
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs font-medium text-slate-900">
                  Contract Annual Review
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs">
                  {contractReviewEvent ? (
                    <>
                      <div className="font-medium text-slate-800">
                        {contractReviewEvent.event_title || "—"}
                      </div>
                      <div className="mt-0.5">
                        <CompactAnnualStatus event={contractReviewEvent} />
                      </div>
                      <Link
                        href={`/admin/employees/${employeeId}/forms/contract-annual-review?eventId=${contractReviewEvent.id}`}
                        className="mt-0.5 inline-block text-[11px] font-semibold text-sky-800 underline"
                      >
                        Open
                      </Link>
                    </>
                  ) : (
                    <CompactAnnualStatus event={contractReviewEvent} />
                  )}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5">
                  <input
                    type="date"
                    value={contractReviewDueDate}
                    onChange={(e) => setContractReviewDueDate(e.target.value)}
                    className={dateInputClass}
                  />
                  {contractReviewEvent ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        updateDueDate(
                          contractReviewEvent.id,
                          contractReviewDueDate,
                          "Contract review event"
                        )
                      }
                      className={btnSecondary}
                    >
                      Update due
                    </button>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={saving || hasOpenContractReviewEvent}
                    onClick={() => createEvent("annual_contract_review")}
                    className={btnCreate}
                  >
                    Create
                  </button>
                  {hasOpenContractReviewEvent ? (
                    <p className="mt-1 max-w-[14rem] text-left text-[10px] text-amber-800">
                      Finish open event before creating another.
                    </p>
                  ) : null}
                </td>
              </tr>
              <tr className="align-top">
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs font-medium text-slate-900">
                  Annual TB Statement
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-xs">
                  {tbStatementEvent ? (
                    <>
                      <div className="font-medium text-slate-800">
                        {tbStatementEvent.event_title || "—"}
                      </div>
                      <div className="mt-0.5">
                        <CompactAnnualStatus event={tbStatementEvent} />
                      </div>
                      <Link
                        href={`/admin/employees/${employeeId}/forms/annual-tb-statement?eventId=${tbStatementEvent.id}`}
                        className="mt-0.5 inline-block text-[11px] font-semibold text-sky-800 underline"
                      >
                        Open
                      </Link>
                    </>
                  ) : (
                    <CompactAnnualStatus event={tbStatementEvent} />
                  )}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5">
                  <input
                    type="date"
                    value={tbStatementDueDate}
                    onChange={(e) => setTbStatementDueDate(e.target.value)}
                    className={dateInputClass}
                  />
                  {tbStatementEvent ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        updateDueDate(tbStatementEvent.id, tbStatementDueDate, "TB statement event")
                      }
                      className={btnSecondary}
                    >
                      Update due
                    </button>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={saving || hasOpenTbStatementEvent}
                    onClick={() => createEvent("annual_tb_statement")}
                    className={btnCreate}
                  >
                    Create
                  </button>
                  {hasOpenTbStatementEvent ? (
                    <p className="mt-1 max-w-[14rem] text-left text-[10px] text-amber-800">
                      Finish open event before creating another.
                    </p>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {error ? (
          <div className="border-t border-rose-100 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-800">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="border-t border-green-100 bg-green-50 px-2 py-1.5 text-xs font-medium text-green-800">
            {message}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Annual Event Management
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Create next-year compliance events and adjust due dates without leaving
            this employee record.
          </p>
        </div>

        <div className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
          Admin Controls
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <div
          id="annual-training-checklist"
          className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Skills Competency Event
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Edit the current due date or create the next annual cycle.
              </p>
            </div>

            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {skillsEvent ? "Current Event Found" : "No Current Event"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {skillsEvent ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Event
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {skillsEvent.event_title || "Skills Competency"}
                </p>
                <AnnualEventStatusRow event={skillsEvent} />
                <div className="mt-3">
                  <Link
                    href={`/admin/employees/${employeeId}/forms/skills-competency?eventId=${skillsEvent.id}`}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open Current Event
                  </Link>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Edit Due Date
                    </label>
                    <input
                      type="date"
                      value={skillsDueDate}
                      onChange={(e) => setSkillsDueDate(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateDueDate(skillsEvent.id, skillsDueDate, "Skills event")
                    }
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Due Date"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Create Next Annual Event
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Recommended next cycle: {nextYear}
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    New Due Date
                  </label>
                  <input
                    type="date"
                    value={skillsDueDate}
                    onChange={(e) => setSkillsDueDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => createEvent("skills_checklist")}
                  className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Skills Event"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          id="annual-contract-review"
          className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Performance Evaluation Event
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Edit the current due date or create the next annual cycle.
              </p>
            </div>

            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {performanceEvent ? "Current Event Found" : "No Current Event"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {performanceEvent ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Event
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {performanceEvent.event_title || "Performance Evaluation"}
                </p>
                <AnnualEventStatusRow event={performanceEvent} />
                <div className="mt-3">
                  <Link
                    href={`/admin/employees/${employeeId}/forms/performance-evaluation?eventId=${performanceEvent.id}`}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open Current Event
                  </Link>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Edit Due Date
                    </label>
                    <input
                      type="date"
                      value={performanceDueDate}
                      onChange={(e) => setPerformanceDueDate(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateDueDate(
                        performanceEvent.id,
                        performanceDueDate,
                        "Performance event"
                      )
                    }
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Due Date"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Create Next Annual Event
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Recommended next cycle: {nextYear}
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    New Due Date
                  </label>
                  <input
                    type="date"
                    value={performanceDueDate}
                    onChange={(e) => setPerformanceDueDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => createEvent("annual_performance_evaluation")}
                  className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Performance Event"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          id="annual-tb-statement"
          className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Annual Training Checklist Event
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Edit the current due date or create the next annual cycle.
              </p>
            </div>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {trainingEvent ? "Current Event Found" : "No Current Event"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {trainingEvent ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Event
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {trainingEvent.event_title || "Annual Training Checklist"}
                </p>
                <AnnualEventStatusRow event={trainingEvent} />
                <div className="mt-3">
                  <Link
                    href={`/admin/employees/${employeeId}/forms/annual-training-checklist?eventId=${trainingEvent.id}`}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open Current Event
                  </Link>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Edit Due Date
                    </label>
                    <input
                      type="date"
                      value={trainingDueDate}
                      onChange={(e) => setTrainingDueDate(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateDueDate(trainingEvent.id, trainingDueDate, "Training event")
                    }
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Due Date"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Create Next Annual Event
              </p>
              <p className="mt-2 text-sm text-slate-600">Recommended next cycle: {nextYear}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    New Due Date
                  </label>
                  <input
                    type="date"
                    value={trainingDueDate}
                    onChange={(e) => setTrainingDueDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || hasOpenTrainingEvent}
                  onClick={() => createEvent("annual_training")}
                  className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Training Event"}
                </button>
              </div>
              {hasOpenTrainingEvent ? (
                <p className="mt-3 text-xs font-medium text-amber-700">
                  Current open event already exists. Complete or close it before creating the next
                  annual training checklist event.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Contract Annual Review Event</h3>
              <p className="mt-1 text-sm text-slate-500">
                Edit the current due date or create the next annual cycle.
              </p>
            </div>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {contractReviewEvent ? "Current Event Found" : "No Current Event"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {contractReviewEvent ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Event
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {contractReviewEvent.event_title || "Contract Annual Review"}
                </p>
                <AnnualEventStatusRow event={contractReviewEvent} />
                <div className="mt-3">
                  <Link
                    href={`/admin/employees/${employeeId}/forms/contract-annual-review?eventId=${contractReviewEvent.id}`}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open Current Event
                  </Link>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Edit Due Date
                    </label>
                    <input
                      type="date"
                      value={contractReviewDueDate}
                      onChange={(e) => setContractReviewDueDate(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateDueDate(
                        contractReviewEvent.id,
                        contractReviewDueDate,
                        "Contract review event"
                      )
                    }
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Due Date"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Create Next Annual Event
              </p>
              <p className="mt-2 text-sm text-slate-600">Recommended next cycle: {nextYear}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    New Due Date
                  </label>
                  <input
                    type="date"
                    value={contractReviewDueDate}
                    onChange={(e) => setContractReviewDueDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || hasOpenContractReviewEvent}
                  onClick={() => createEvent("annual_contract_review")}
                  className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create Contract Review Event"}
                </button>
              </div>
              {hasOpenContractReviewEvent ? (
                <p className="mt-3 text-xs font-medium text-amber-700">
                  Current open event already exists. Complete or close it before creating the next
                  contract annual review event.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Annual TB Statement Event</h3>
              <p className="mt-1 text-sm text-slate-500">
                Edit the current due date or create the next annual cycle.
              </p>
            </div>
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {tbStatementEvent ? "Current Event Found" : "No Current Event"}
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {tbStatementEvent ? (
              <div className="rounded-[20px] border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Current Event
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {tbStatementEvent.event_title || "Annual TB Statement"}
                </p>
                <AnnualEventStatusRow event={tbStatementEvent} />
                <div className="mt-3">
                  <Link
                    href={`/admin/employees/${employeeId}/forms/annual-tb-statement?eventId=${tbStatementEvent.id}`}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Open Current Event
                  </Link>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Edit Due Date
                    </label>
                    <input
                      type="date"
                      value={tbStatementDueDate}
                      onChange={(e) => setTbStatementDueDate(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateDueDate(tbStatementEvent.id, tbStatementDueDate, "TB statement event")
                    }
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Due Date"}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Create Next Annual Event
              </p>
              <p className="mt-2 text-sm text-slate-600">Recommended next cycle: {nextYear}</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    New Due Date
                  </label>
                  <input
                    type="date"
                    value={tbStatementDueDate}
                    onChange={(e) => setTbStatementDueDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || hasOpenTbStatementEvent}
                  onClick={() => createEvent("annual_tb_statement")}
                  className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create TB Statement Event"}
                </button>
              </div>
              {hasOpenTbStatementEvent ? (
                <p className="mt-3 text-xs font-medium text-amber-700">
                  Current open event already exists. Complete or close it before creating the next
                  annual TB statement event.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="mt-5 rounded-[20px] border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          {message}
        </div>
      ) : null}
    </div>
  );
}