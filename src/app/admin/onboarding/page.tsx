"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatAppDate } from "@/lib/datetime/app-timezone";

type Applicant = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  position: string | null;
};

type ComplianceEvent = {
  id: string;
  applicant_id: string;
  event_type: string;
  event_title: string;
  status: string;
  due_date: string | null;
  next_due_date: string | null;
  reminder_date: string | null;
  priority: string;
  notes: string | null;
};

type DashboardRow = {
  applicant: Applicant;
  events: ComplianceEvent[];
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return formatAppDate(value, value);
}

function getStatusFromEvents(events: ComplianceEvent[]) {
  if (!events || events.length === 0) return "GOOD";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let hasOverdue = false;
  let hasDueSoon = false;

  for (const event of events) {
    if (!event.due_date || event.status === "completed" || event.status === "waived") {
      continue;
    }

    const due = new Date(event.due_date);
    due.setHours(0, 0, 0, 0);

    if (due < today) {
      hasOverdue = true;
      continue;
    }

    const diffDays =
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays <= 30) {
      hasDueSoon = true;
    }
  }

  if (hasOverdue) return "OVERDUE";
  if (hasDueSoon) return "DUE SOON";
  return "GOOD";
}

const StatusPill = memo(function StatusPill({ status }: { status: string }) {
  if (status === "OVERDUE") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
        OVERDUE
      </span>
    );
  }

  if (status === "DUE SOON") {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">
        DUE SOON
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
      GOOD
    </span>
  );
});

const OnboardingApplicantTableRow = memo(function OnboardingApplicantTableRow({ row }: { row: DashboardRow }) {
  const applicantName =
    `${row.applicant.first_name || ""} ${row.applicant.last_name || ""}`.trim() || "Unnamed Applicant";
  const status = getStatusFromEvents(row.events);

  return (
    <tr className="border-t border-slate-200 align-top hover:bg-slate-50">
      <td className="px-6 py-5 font-semibold text-slate-900">
        <Link
          href={`/admin/onboarding/${row.applicant.id}`}
          className="transition hover:text-sky-700 hover:underline"
        >
          {applicantName}
        </Link>
      </td>

      <td className="px-6 py-5 text-slate-700">{row.applicant.email || "—"}</td>

      <td className="px-6 py-5 text-slate-700">{row.applicant.position || "—"}</td>

      <td className="px-6 py-5">
        <StatusPill status={status} />
      </td>

      <td className="px-6 py-5">
        {row.events.length === 0 ? (
          <span className="text-slate-500">0 items</span>
        ) : (
          <div className="space-y-2">
            {row.events.slice(0, 3).map((event) => (
              <div key={event.id} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
                <div className="font-semibold text-slate-800">{event.event_title}</div>
                <div className="mt-1">Due: {formatDate(event.due_date)}</div>
                <div className="mt-1">Status: {event.status}</div>
              </div>
            ))}

            {row.events.length > 3 && (
              <div className="text-xs font-medium text-slate-500">+{row.events.length - 3} more</div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
});

const SummaryCard = memo(function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "green" | "yellow" | "red";
}) {
  const toneClasses =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "yellow"
        ? "border-yellow-200 bg-yellow-50 text-yellow-700"
        : tone === "red"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses}`}>
      <div className="text-sm font-semibold uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold">{value}</div>
    </div>
  );
});

export default function AdminOnboardingDashboard() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      setErrorMessage("");

      try {
        const [{ data: applicantsData, error: applicantsError }, { data: eventsData, error: eventsError }] =
          await Promise.all([
            supabase
              .from("applicants")
              .select("id, first_name, last_name, email, position")
              .order("created_at", { ascending: false }),
            supabase
              .from("admin_compliance_events")
              .select(
                "id, applicant_id, event_type, event_title, status, due_date, next_due_date, reminder_date, priority, notes"
              )
              .order("due_date", { ascending: true }),
          ]);

        if (applicantsError) {
          throw applicantsError;
        }

        if (eventsError) {
          throw eventsError;
        }

        const applicants = (applicantsData || []) as Applicant[];
        const events = (eventsData || []) as ComplianceEvent[];

        const eventsByApplicantId = new Map<string, ComplianceEvent[]>();
        for (const event of events) {
          const aid = event.applicant_id;
          let list = eventsByApplicantId.get(aid);
          if (!list) {
            list = [];
            eventsByApplicantId.set(aid, list);
          }
          list.push(event);
        }

        const groupedRows: DashboardRow[] = applicants.map((applicant) => ({
          applicant,
          events: eventsByApplicantId.get(applicant.id) ?? [],
        }));

        setRows(groupedRows);
      } catch (error) {
        console.error(error);
        setErrorMessage("Failed to load admin onboarding dashboard.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const summary = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let good = 0;

    rows.forEach((row) => {
      const status = getStatusFromEvents(row.events);
      if (status === "OVERDUE") overdue += 1;
      else if (status === "DUE SOON") dueSoon += 1;
      else good += 1;
    });

    return {
      total: rows.length,
      overdue,
      dueSoon,
      good,
    };
  }, [rows]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 animate-pulse">
            <div className="h-10 w-80 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-4 animate-pulse">
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
              <div className="h-12 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            Admin Onboarding Dashboard
          </h1>
          <p className="mt-3 max-w-3xl text-base text-slate-600">
            Track employee onboarding and annual compliance requirements in one place.
          </p>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total Employees" value={summary.total} tone="slate" />
          <SummaryCard label="Good Standing" value={summary.good} tone="green" />
          <SummaryCard label="Due Soon" value={summary.dueSoon} tone="yellow" />
          <SummaryCard label="Overdue" value={summary.overdue} tone="red" />
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-slate-100 text-left">
                  <tr>
                    <th className="px-6 py-5 font-bold text-slate-800">Name</th>
                    <th className="px-6 py-5 font-bold text-slate-800">Email</th>
                    <th className="px-6 py-5 font-bold text-slate-800">Role</th>
                    <th className="px-6 py-5 font-bold text-slate-800">Status</th>
                    <th className="px-6 py-5 font-bold text-slate-800">Compliance Items</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <OnboardingApplicantTableRow key={row.applicant.id} row={row} />
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-12 text-center text-sm text-slate-500"
                      >
                        No applicants found yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}