"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatAppDate } from "@/lib/datetime/app-timezone";

type Applicant = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  created_at?: string | null;
};

type ComplianceEvent = {
  id: string;
  applicant_id: string;
  event_type: string;
  event_title: string;
  status: "pending" | "in_progress" | "completed" | "overdue" | "waived";
  priority: "low" | "normal" | "high" | "critical";
  due_date: string | null;
  next_due_date: string | null;
  reminder_date: string | null;
  completed_at: string | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ComplianceDocument = {
  id: string;
  compliance_event_id: string;
  applicant_id: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return formatAppDate(value, value);
}

function getEventStatus(event: ComplianceEvent) {
  if (event.status === "completed") return "completed";
  if (event.status === "waived") return "waived";

  if (event.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(event.due_date);
    due.setHours(0, 0, 0, 0);

    if (due < today) return "overdue";
  }

  return event.status;
}

function getOverallStatus(events: ComplianceEvent[]) {
  if (!events.length) return "GOOD";

  let hasOverdue = false;
  let hasDueSoon = false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const event of events) {
    const computedStatus = getEventStatus(event);

    if (computedStatus === "overdue") {
      hasOverdue = true;
      continue;
    }

    if (
      computedStatus !== "completed" &&
      computedStatus !== "waived" &&
      event.due_date
    ) {
      const due = new Date(event.due_date);
      due.setHours(0, 0, 0, 0);

      const diffDays =
        (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays <= 30 && diffDays >= 0) {
        hasDueSoon = true;
      }
    }
  }

  if (hasOverdue) return "OVERDUE";
  if (hasDueSoon) return "DUE SOON";
  return "GOOD";
}

function StatusPill({ status }: { status: string }) {
  if (status === "OVERDUE" || status === "overdue") {
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

  if (status === "completed") {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
        COMPLETED
      </span>
    );
  }

  if (status === "waived") {
    return (
      <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
        WAIVED
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
        IN PROGRESS
      </span>
    );
  }

  if (status === "pending") {
    return (
      <span className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
        PENDING
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
      GOOD
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const classes =
    priority === "critical"
      ? "bg-red-100 text-red-700"
      : priority === "high"
      ? "bg-orange-100 text-orange-700"
      : priority === "normal"
      ? "bg-sky-100 text-sky-700"
      : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${classes}`}
    >
      {priority}
    </span>
  );
}

export default function EmployeeCompliancePage() {
  const params = useParams();
  const applicantId = Array.isArray(params.applicantId)
    ? params.applicantId[0]
    : (params.applicantId as string);

  const [applicant, setApplicant] = useState<Applicant | null>(null);
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [debugMessage, setDebugMessage] = useState("");
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!applicantId) {
      setLoading(false);
      setErrorMessage("Missing applicant ID in route.");
      return;
    }

    const loadPage = async () => {
      setLoading(true);
      setErrorMessage("");
      setDebugMessage("");

      try {
        const [
          { data: applicantData, error: applicantError },
          { data: eventsData, error: eventsError },
          { data: docsData, error: docsError },
        ] = await Promise.all([
          supabase
            .from("applicants")
            .select("id, first_name, last_name, email, phone, position, created_at")
            .eq("id", applicantId)
            .maybeSingle(),
          supabase
            .from("admin_compliance_events")
            .select("*")
            .eq("applicant_id", applicantId)
            .order("due_date", { ascending: true }),
          supabase
            .from("admin_compliance_documents")
            .select("*")
            .eq("applicant_id", applicantId)
            .order("uploaded_at", { ascending: false }),
        ]);

        if (applicantError) throw applicantError;
        if (eventsError) throw eventsError;
        if (docsError) throw docsError;

        setApplicant((applicantData as Applicant) || null);
        setEvents((eventsData as ComplianceEvent[]) || []);
        setDocuments((docsData as ComplianceDocument[]) || []);

        setDebugMessage(
          `Applicant route ID: ${applicantId} | Applicant found: ${
            applicantData ? "yes" : "no"
          } | Compliance events: ${(eventsData || []).length} | Compliance docs: ${(docsData || []).length}`
        );
      } catch (error) {
        console.error("Employee compliance page load error:", error);
        setErrorMessage("Failed to load employee compliance page.");
        setDebugMessage(
          error instanceof Error ? error.message : "Unknown error"
        );
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [applicantId]);

  const handleMarkComplete = async (eventId: string) => {
    if (savingEventId) return;

    setSavingEventId(eventId);

    const completedAt = new Date().toISOString();

    try {
      const { error } = await supabase
        .from("admin_compliance_events")
        .update({
          status: "completed",
          completed_at: completedAt,
        })
        .eq("id", eventId);

      if (error) throw error;

      setEvents((prev) =>
        prev.map((event) =>
          event.id === eventId
            ? {
                ...event,
                status: "completed",
                completed_at: completedAt,
              }
            : event
        )
      );
    } catch (error) {
      console.error("Failed to mark compliance item complete:", error);
      alert("Failed to mark complete.");
    } finally {
      setSavingEventId(null);
    }
  };

  const handleUploadDocument = async (
    event: ComplianceEvent,
    e: ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !applicantId) return;

    setUploadingEventId(event.id);

    try {
      const safeFileName = file.name.replace(/\s+/g, "-");
      const uniquePath = `${applicantId}/${event.id}/${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("admin-compliance-docs")
        .upload(uniquePath, file, {
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("admin-compliance-docs")
        .getPublicUrl(uniquePath);

      const fileUrl = publicUrlData.publicUrl;

      const { data: insertedDoc, error: insertError } = await supabase
        .from("admin_compliance_documents")
        .insert({
          compliance_event_id: event.id,
          applicant_id: applicantId,
          file_name: file.name,
          file_url: fileUrl,
          uploaded_by: "admin",
          notes: `${event.event_title} uploaded document`,
        })
        .select("*")
        .single();

      if (insertError) throw insertError;

      setDocuments((prev) => [insertedDoc as ComplianceDocument, ...prev]);

      alert("Document uploaded successfully.");
    } catch (error) {
      console.error("Failed to upload compliance document:", error);
      alert("Failed to upload document.");
    } finally {
      setUploadingEventId(null);
      e.target.value = "";
    }
  };

  const summary = useMemo(() => {
    const overall = getOverallStatus(events);

    const completed = events.filter(
      (event) => getEventStatus(event) === "completed"
    ).length;

    const overdue = events.filter(
      (event) => getEventStatus(event) === "overdue"
    ).length;

    const pending = events.filter((event) => {
      const status = getEventStatus(event);
      return status === "pending" || status === "in_progress";
    }).length;

    return {
      overall,
      total: events.length,
      completed,
      overdue,
      pending,
    };
  }, [events]);

  const getEventDocuments = (eventId: string) =>
    documents.filter((doc) => doc.compliance_event_id === eventId);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-7xl animate-pulse">
          <div className="h-10 w-96 rounded bg-slate-200" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <div className="h-28 rounded-2xl bg-slate-200" />
            <div className="h-28 rounded-2xl bg-slate-200" />
            <div className="h-28 rounded-2xl bg-slate-200" />
            <div className="h-28 rounded-2xl bg-slate-200" />
          </div>
          <div className="mt-8 h-96 rounded-2xl bg-slate-200" />
        </div>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Debug: {debugMessage || "No debug message"}
          </div>
          <Link
            href="/admin/onboarding"
            className="inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (!applicant) {
    return (
      <main className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
            Employee not found.
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Debug: {debugMessage || "No debug message"}
          </div>
          <Link
            href="/admin/onboarding"
            className="inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
          >
            Back to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  const applicantName =
    `${applicant.first_name || ""} ${applicant.last_name || ""}`.trim() ||
    "Unnamed Employee";

  return (
    <main className="min-h-screen bg-slate-50 p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/admin/onboarding"
              className="inline-flex rounded-full bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
            >
              Back to Dashboard
            </Link>

            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
              {applicantName}
            </h1>

            <p className="mt-3 max-w-3xl text-base text-slate-600">
              Employee compliance profile for onboarding, annual reviews, skills,
              and ongoing tracking.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Overall Status
            </div>
            <div className="mt-3">
              <StatusPill status={summary.overall} />
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Debug: {debugMessage}
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total Items" value={summary.total} tone="slate" />
          <SummaryCard label="Completed" value={summary.completed} tone="green" />
          <SummaryCard label="Pending" value={summary.pending} tone="yellow" />
          <SummaryCard label="Overdue" value={summary.overdue} tone="red" />
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">Employee Info</h2>

            <div className="mt-6 space-y-4 text-sm">
              <InfoRow label="Name" value={applicantName} />
              <InfoRow label="Email" value={applicant.email || "—"} />
              <InfoRow label="Phone" value={applicant.phone || "—"} />
              <InfoRow label="Role" value={applicant.position || "—"} />
              <InfoRow label="Applicant ID" value={applicant.id} />
              <InfoRow
                label="Application Created"
                value={formatDate(applicant.created_at)}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Compliance Snapshot
            </h2>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {events.length === 0 ? (
                <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No compliance events found for this employee yet.
                </div>
              ) : (
                events.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-bold text-slate-900">
                        {event.event_title}
                      </div>
                      <StatusPill status={getEventStatus(event)} />
                    </div>

                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>Due: {formatDate(event.due_date)}</div>
                      <div>Reminder: {formatDate(event.reminder_date)}</div>
                      <div>Priority: {event.priority}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-bold text-slate-900">
              All Compliance Items
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Review each event, due date, current status, notes, and uploaded files.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {events.length === 0 ? (
              <div className="px-6 py-10 text-sm text-slate-500">
                No compliance items found.
              </div>
            ) : (
              events.map((event) => {
                const eventDocuments = getEventDocuments(event.id);

                return (
                  <div key={event.id} className="px-6 py-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900">
                            {event.event_title}
                          </h3>
                          <StatusPill status={getEventStatus(event)} />
                          <PriorityPill priority={event.priority} />
                        </div>

                        <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                          <div>
                            <span className="font-semibold text-slate-800">
                              Event Type:
                            </span>{" "}
                            {event.event_type}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800">
                              Due Date:
                            </span>{" "}
                            {formatDate(event.due_date)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800">
                              Reminder Date:
                            </span>{" "}
                            {formatDate(event.reminder_date)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800">
                              Next Due Date:
                            </span>{" "}
                            {formatDate(event.next_due_date)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800">
                              Completed At:
                            </span>{" "}
                            {formatDate(event.completed_at)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-800">
                              Current Status:
                            </span>{" "}
                            {event.status}
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          <div className="font-semibold text-slate-900">Notes</div>
                          <div className="mt-2">{event.notes || "—"}</div>
                        </div>

                        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                          <div className="text-sm font-semibold text-slate-900">
                            Uploaded Documents
                          </div>

                          {eventDocuments.length === 0 ? (
                            <div className="mt-2 text-sm text-slate-500">
                              No files uploaded yet.
                            </div>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {eventDocuments.map((doc) => (
                                <a
                                  key={doc.id}
                                  href={doc.file_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-slate-200 hover:underline"
                                >
                                  {doc.file_name}
                                  <span className="ml-2 text-xs text-slate-500">
                                    uploaded {formatDate(doc.uploaded_at)}
                                  </span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:max-w-xs">
                        <div className="text-sm font-bold uppercase tracking-wide text-slate-500">
                          Actions
                        </div>

                        <div className="mt-4 grid gap-3">
                          <button
                            type="button"
                            onClick={() => handleMarkComplete(event.id)}
                            disabled={savingEventId === event.id || event.status === "completed"}
                            className={`rounded-full px-4 py-3 text-sm font-bold text-white ${
                              savingEventId === event.id || event.status === "completed"
                                ? "cursor-not-allowed bg-slate-300"
                                : "bg-green-600 hover:bg-green-700"
                            }`}
                          >
                            {savingEventId === event.id
                              ? "Saving..."
                              : event.status === "completed"
                              ? "Completed"
                              : "Mark Complete"}
                          </button>

                          <label
                            className={`flex cursor-pointer items-center justify-center rounded-full px-4 py-3 text-sm font-bold ${
                              uploadingEventId === event.id
                                ? "cursor-not-allowed bg-slate-300 text-white"
                                : "bg-sky-600 text-white hover:bg-sky-700"
                            }`}
                          >
                            {uploadingEventId === event.id
                              ? "Uploading..."
                              : "Upload Document"}

                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              className="hidden"
                              disabled={uploadingEventId === event.id}
                              onChange={(e) => handleUploadDocument(event, e)}
                            />
                          </label>

                          <button
                            type="button"
                            disabled
                            className="rounded-full bg-slate-200 px-4 py-3 text-sm font-bold text-slate-500"
                          >
                            Edit Due Date (next step)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="max-w-[60%] break-words text-right font-medium text-slate-900">
        {value}
      </span>
    </div>
  );
}

function SummaryCard({
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
}