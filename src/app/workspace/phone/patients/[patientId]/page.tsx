import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PatientHubClient } from "@/app/workspace/phone/patients/_components/PatientHubClient";
import { PatientProfileEditForm } from "@/app/workspace/phone/patients/_components/PatientProfileEditForm";
import { VoicemailCard } from "@/app/workspace/phone/_components/VoicemailCard";
import { displayNameFromContact, formatAdminPhoneWhen } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { readCrmMetadata, formatCrmTypeLabel, formatCrmOutcomeLabel } from "@/app/admin/phone/_lib/crm-metadata";
import { readVoiceAiMetadata } from "@/app/admin/phone/_lib/voice-ai-metadata";
import type { PhoneCallRow } from "@/app/admin/phone/recent-calls-live";
import {
  parseVoiceAiMini,
  formatVisitChip,
  formatDurationSeconds,
  type TimelineEntry,
} from "@/lib/crm/patient-hub-detail-display";
import {
  buildCaregiverAlternateSummary,
  hasDoctorOfficeDisplayInfo,
} from "@/lib/crm/patient-caregiver-display";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { voicemailTranscriptFromMeta, voiceAiShortSummaryFromMeta } from "@/lib/phone/voicemail-display";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContactShape = Record<string, unknown>;

type VisitRow = {
  id: string;
  scheduled_for: string | null;
  status: string;
  visit_note: string | null;
  reminder_recipient: string | null;
  reminder_day_before_sent_at: string | null;
  reminder_day_of_sent_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  arrived_lat: number | null;
  arrived_lng: number | null;
  completed_lat: number | null;
  completed_lng: number | null;
  created_at: string;
};

function roleChip(role: string, discipline?: string | null): string {
  const r = role.trim().toLowerCase();
  if (r === "primary_nurse") return "Primary nurse";
  if (r === "backup_nurse") return "Backup nurse";
  if (r === "intake") return "Intake";
  if (r === "admin") return "Admin";
  if (r === "clinician") {
    const d = typeof discipline === "string" ? discipline.trim() : "";
    return d ? `Clinician (${d})` : "Clinician";
  }
  return role.replace(/_/g, " ");
}

function voicemailCallbackNumber(call: {
  direction?: string | null;
  from_e164?: string | null;
  to_e164?: string | null;
}): string | null {
  const dir = typeof call.direction === "string" ? call.direction.trim().toLowerCase() : "";
  const inbound = typeof call.from_e164 === "string" ? call.from_e164.trim() : "";
  const outbound = typeof call.to_e164 === "string" ? call.to_e164.trim() : "";
  if (dir === "outbound") return outbound || null;
  return inbound || null;
}

function onSiteDurationLabel(arrivedAt: string | null, completedAt: string | null): string | null {
  if (!arrivedAt || !completedAt) return null;
  const a = new Date(arrivedAt).getTime();
  const b = new Date(completedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const mins = Math.round((b - a) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default async function WorkspacePatientDetailPage(props: { params: Promise<{ patientId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const { patientId } = await props.params;
  if (!patientId || !UUID_RE.test(patientId)) {
    notFound();
  }

  const { data: assignRows, error: assignErr } = await supabaseAdmin
    .from("patient_assignments")
    .select("id, role, patient_id, discipline")
    .eq("assigned_user_id", staff.user_id)
    .eq("is_active", true)
    .eq("patient_id", patientId);

  if (assignErr || !assignRows?.length || !assignRows[0]?.patient_id) {
    notFound();
  }

  const { data: patientRow, error: pErr } = await supabaseAdmin
    .from("patients")
    .select(
      `
      id,
      patient_status,
      contact_id,
      notes,
      visit_plan_summary,
      visit_plan_target_total,
      physician_name,
      referring_doctor_name,
      doctor_office_name,
      doctor_office_phone,
      doctor_office_fax,
      doctor_office_contact_person,
      contacts (
        id,
        full_name,
        first_name,
        last_name,
        primary_phone,
        secondary_phone,
        relationship_metadata,
        address_line_1,
        address_line_2,
        city,
        state,
        zip
      )
    `
    )
    .eq("id", patientId)
    .maybeSingle();

  if (pErr || !patientRow?.id) {
    notFound();
  }

  let contact: ContactShape | null = null;
  const cRaw = (patientRow as { contacts?: unknown }).contacts;
  if (cRaw && typeof cRaw === "object" && !Array.isArray(cRaw)) {
    contact = cRaw as ContactShape;
  } else if (Array.isArray(cRaw) && cRaw[0] && typeof cRaw[0] === "object") {
    contact = cRaw[0] as ContactShape;
  }

  const contactIdFallback = typeof (patientRow as { contact_id?: string }).contact_id === "string"
    ? (patientRow as { contact_id: string }).contact_id.trim()
    : "";

  if (!contact?.id && contactIdFallback) {
    const { data: cOnly } = await supabaseAdmin
      .from("contacts")
      .select(
        "id, full_name, first_name, last_name, primary_phone, secondary_phone, relationship_metadata, address_line_1, address_line_2, city, state, zip"
      )
      .eq("id", contactIdFallback)
      .maybeSingle();
    if (cOnly && typeof cOnly === "object") {
      contact = cOnly as ContactShape;
    }
  }

  if (!contact || typeof contact.id !== "string") {
    notFound();
  }

  const contactId = contact.id;

  const name = displayNameFromContact(
    contact as { full_name?: string | null; first_name?: string | null; last_name?: string | null }
  );
  const primaryPhone = typeof contact.primary_phone === "string" ? contact.primary_phone.trim() : "";
  const secondaryPhone = typeof contact.secondary_phone === "string" ? contact.secondary_phone.trim() : "";
  const caregiverSummary = buildCaregiverAlternateSummary({
    secondaryPhone,
    relationshipMetadata: contact.relationship_metadata,
  });

  const pr = patientRow as Record<string, unknown>;
  const doctorOffice = {
    physician_name: typeof pr.physician_name === "string" ? pr.physician_name : null,
    referring_doctor_name: typeof pr.referring_doctor_name === "string" ? pr.referring_doctor_name : null,
    doctor_office_name: typeof pr.doctor_office_name === "string" ? pr.doctor_office_name : null,
    doctor_office_phone: typeof pr.doctor_office_phone === "string" ? pr.doctor_office_phone : null,
    doctor_office_fax: typeof pr.doctor_office_fax === "string" ? pr.doctor_office_fax : null,
    doctor_office_contact_person: typeof pr.doctor_office_contact_person === "string" ? pr.doctor_office_contact_person : null,
  };
  const showDoctorOffice = hasDoctorOfficeDisplayInfo(doctorOffice);

  const patientNotesRaw =
    typeof (patientRow as { notes?: string | null }).notes === "string"
      ? (patientRow as { notes: string }).notes
      : "";

  const profileInitial = {
    full_name: typeof contact.full_name === "string" ? contact.full_name : "",
    primary_phone: primaryPhone,
    secondary_phone: secondaryPhone,
    address_line_1: typeof contact.address_line_1 === "string" ? contact.address_line_1 : "",
    address_line_2: typeof contact.address_line_2 === "string" ? contact.address_line_2 : "",
    city: typeof contact.city === "string" ? contact.city : "",
    state: typeof contact.state === "string" ? contact.state : "",
    zip: typeof contact.zip === "string" ? contact.zip : "",
    patient_notes: patientNotesRaw,
  };

  const { data: visitData } = await supabaseAdmin
    .from("patient_visits")
    .select(
      "id, scheduled_for, status, visit_note, reminder_recipient, reminder_day_before_sent_at, reminder_day_of_sent_at, en_route_at, arrived_at, completed_at, arrived_lat, arrived_lng, completed_lat, completed_lng, created_at"
    )
    .eq("patient_id", patientId)
    .order("scheduled_for", { ascending: true, nullsFirst: false });

  const visits = (visitData ?? []) as VisitRow[];

  /** Server render boundary for “upcoming” — not a React client render. */
  const now = new Date().getTime();
  const completedVisits = visits.filter((v) => v.status === "completed");
  const completedCount = completedVisits.length;
  const targetTotal =
    typeof (patientRow as { visit_plan_target_total?: number | null }).visit_plan_target_total === "number"
      ? (patientRow as { visit_plan_target_total: number }).visit_plan_target_total
      : null;
  const remainingVisits =
    targetTotal != null ? Math.max(0, targetTotal - completedCount) : null;

  const upcomingStatuses = new Set(["scheduled", "confirmed", "en_route"]);
  const upcoming = visits.filter((v) => {
    if (!v.scheduled_for || !upcomingStatuses.has(v.status)) return false;
    const t = new Date(v.scheduled_for).getTime();
    return !Number.isNaN(t) && t >= now;
  });
  const nextVisit = upcoming[0] ?? null;

  const planSummary =
    typeof (patientRow as { visit_plan_summary?: string | null }).visit_plan_summary === "string"
      ? (patientRow as { visit_plan_summary: string }).visit_plan_summary.trim()
      : "";

  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select("id, last_message_at, metadata, lead_status")
    .eq("channel", "sms")
    .eq("primary_contact_id", contactId)
    .maybeSingle();

  const conversationId = conv?.id ? String(conv.id) : null;
  const aiMini = parseVoiceAiMini(conv?.metadata);

  const { data: msgRows } = conversationId
    ? await supabaseAdmin
        .from("messages")
        .select("created_at, direction, body")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: null };

  const { data: callRows } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "id, direction, status, started_at, from_e164, to_e164, voicemail_recording_sid, voicemail_duration_seconds, metadata, duration_seconds, created_at, assigned_to_user_id"
    )
    .eq("contact_id", contactId)
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(25);

  const calls = (callRows ?? []) as unknown as PhoneCallRow[];

  const vmCalls = calls.filter(
    (c) => typeof c.voicemail_recording_sid === "string" && c.voicemail_recording_sid.trim() !== ""
  );
  const vmCount = vmCalls.length;

  const timeline: TimelineEntry[] = [];

  for (const m of msgRows ?? []) {
    const at = typeof m.created_at === "string" ? m.created_at : "";
    if (!at) continue;
    const dir = String(m.direction).toLowerCase() === "inbound" ? "In" : "Out";
    const body = typeof m.body === "string" ? m.body.trim().slice(0, 220) : "";
    timeline.push({ kind: "sms", at, label: `SMS ${dir}`, body: body || "—" });
  }

  for (const call of calls) {
    const at =
      typeof call.started_at === "string" ? call.started_at : (call.created_at as string | undefined);
    if (!at) continue;
    const dir = String(call.direction).toLowerCase() === "inbound" ? "Inbound" : "Outbound";
    const vm =
      typeof call.voicemail_recording_sid === "string" && call.voicemail_recording_sid.trim() !== "";
    const sub = `${dir} · ${String(call.status)}${
      typeof call.duration_seconds === "number" ? ` · ${call.duration_seconds}s` : ""
    }`;
    timeline.push({ kind: "call", at, label: "Call", sub, hasVm: vm });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const patientStatus =
    typeof (patientRow as { patient_status?: string }).patient_status === "string" &&
    (patientRow as { patient_status: string }).patient_status.trim()
      ? (patientRow as { patient_status: string }).patient_status.replace(/_/g, " ")
      : null;

  /** How this staff member is linked to the chart (primary nurse, clinician line(s), etc.). */
  const viewerAssignmentRows = assignRows ?? [];
  const roleOrder: Record<string, number> = {
    primary_nurse: 0,
    backup_nurse: 1,
    clinician: 2,
    intake: 3,
    admin: 4,
  };
  const sortedViewerAssignments = [...viewerAssignmentRows].sort((a, b) => {
    const ra = typeof a.role === "string" ? a.role : "";
    const rb = typeof b.role === "string" ? b.role : "";
    const oa = roleOrder[ra] ?? 99;
    const ob = roleOrder[rb] ?? 99;
    if (oa !== ob) return oa - ob;
    const da = typeof a.discipline === "string" ? a.discipline : "";
    const db = typeof b.discipline === "string" ? b.discipline : "";
    return da.localeCompare(db);
  });
  const roleLabel =
    sortedViewerAssignments
      .map((row) =>
        typeof row.role === "string" ? roleChip(row.role, row.discipline ?? null) : null
      )
      .filter((x): x is string => Boolean(x))
      .join(" · ") || "Assignment";

  const latestForAi = calls[0] ?? null;
  const voiceAiCall = latestForAi ? readVoiceAiMetadata(latestForAi) : null;
  const crmCall = latestForAi ? readCrmMetadata(latestForAi) : readCrmMetadata(null);

  const viewerName =
    (typeof staff.full_name === "string" && staff.full_name.trim()) ||
    (typeof staff.email === "string" && staff.email.trim()) ||
    "You";

  const quickCopy = {
    reschedule:
      "Hi — this is Saintly Home Health. We need to reschedule your visit. Reply when you have a moment.",
    confirm:
      "Hi — please confirm your upcoming visit with Saintly Home Health. Reply YES to confirm.",
    runningLate:
      "Hi — this is Saintly Home Health. I'm running a few minutes late. Thank you for your patience.",
  };

  return (
    <div className="px-4 pb-28 pt-4">
      <Link href="/workspace/phone/patients" className="text-sm font-medium text-sky-900/90 hover:underline">
        ← Patients
      </Link>

      <section className="mt-4 rounded-3xl bg-white/95 p-4 shadow-sm shadow-slate-200/35 ring-1 ring-slate-200/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Patient profile</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{name}</h1>
            {patientStatus ? (
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{patientStatus}</p>
            ) : null}
          </div>
          {vmCount > 0 ? (
            <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-semibold text-violet-900">
              {vmCount} voicemail{vmCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Address</p>
          <div className="mt-1 text-sm leading-relaxed text-slate-800">
            {(() => {
              const line1 = typeof contact.address_line_1 === "string" ? contact.address_line_1.trim() : "";
              const line2 = typeof contact.address_line_2 === "string" ? contact.address_line_2.trim() : "";
              const city = typeof contact.city === "string" ? contact.city.trim() : "";
              const state = typeof contact.state === "string" ? contact.state.trim() : "";
              const zip = typeof contact.zip === "string" ? contact.zip.trim() : "";
              const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
              if (!line1 && !line2 && !cityLine) {
                return <p className="text-slate-400">No address on file</p>;
              }
              return (
                <div className="space-y-0.5">
                  {line1 ? <p>{line1}</p> : null}
                  {line2 ? <p>{line2}</p> : null}
                  {cityLine ? <p>{cityLine}</p> : null}
                </div>
              );
            })()}
          </div>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Patient phone</dt>
            <dd className="mt-0.5 text-sm tabular-nums text-slate-900">{formatPhoneForDisplay(primaryPhone)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Caregiver / alternate</dt>
            <dd className="mt-0.5 text-sm text-slate-800">
              {caregiverSummary.isEmpty ? (
                <span className="tabular-nums text-slate-500">—</span>
              ) : (
                <div className="space-y-1">
                  {caregiverSummary.secondaryLine ? (
                    <p className="tabular-nums font-medium text-slate-900">{caregiverSummary.secondaryLine}</p>
                  ) : null}
                  {caregiverSummary.metadataLines.map((line, i) => (
                    <p key={i} className="text-sm text-slate-700">
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </dd>
          </div>
        </dl>

        {showDoctorOffice ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Doctor / office (referral)</p>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {(doctorOffice.physician_name ?? "").trim() || (doctorOffice.referring_doctor_name ?? "").trim() ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Physician</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {(doctorOffice.physician_name ?? "").trim() ||
                      (doctorOffice.referring_doctor_name ?? "").trim() ||
                      "—"}
                  </dd>
                </div>
              ) : null}
              {(doctorOffice.doctor_office_name ?? "").trim() ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Practice</dt>
                  <dd className="mt-0.5 text-slate-800">{(doctorOffice.doctor_office_name ?? "").trim()}</dd>
                </div>
              ) : null}
              {(doctorOffice.doctor_office_contact_person ?? "").trim() ? (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Office contact</dt>
                  <dd className="mt-0.5 text-slate-800">{(doctorOffice.doctor_office_contact_person ?? "").trim()}</dd>
                </div>
              ) : null}
              {(doctorOffice.doctor_office_phone ?? "").trim() ? (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Office phone</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-800">
                    {formatPhoneForDisplay(doctorOffice.doctor_office_phone ?? "")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-700">Preferred reach-out: </span>
          {conversationId
            ? "SMS thread is available — use Text patient or Open thread below."
            : "No SMS thread yet — call or ask the office to start messaging."}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {roleLabel}
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-900">
            {viewerName}
          </span>
          {typeof conv?.lead_status === "string" && conv.lead_status.trim() ? (
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold capitalize text-sky-900">
              {conv.lead_status.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>

        {patientNotesRaw.trim() ? (
          <div className="mt-4 rounded-2xl bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-100/80">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/90">Operational notes</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{patientNotesRaw.trim()}</p>
            <p className="mt-2 text-[10px] text-amber-900/80">Visible to your team. Edit below.</p>
          </div>
        ) : null}
      </section>

      <section className="mt-4 rounded-3xl bg-gradient-to-br from-indigo-50/60 to-white p-4 ring-1 ring-indigo-100/70">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-900/75">Visit plan &amp; frequency</p>
            <p className="mt-0.5 text-xs text-indigo-950/60">Targets from CRM — same numbers your manager sees.</p>
          </div>
        </div>
        {planSummary ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{planSummary}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            No visit plan summary yet. Your manager can add frequency in CRM.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/90 px-3 py-2 ring-1 ring-indigo-100/60">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Target total</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{targetTotal ?? "—"}</p>
          </div>
          <div className="rounded-2xl bg-white/90 px-3 py-2 ring-1 ring-indigo-100/60">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Completed</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{completedCount}</p>
          </div>
          <div className="rounded-2xl bg-white/90 px-3 py-2 ring-1 ring-indigo-100/60">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Remaining</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{remainingVisits ?? "—"}</p>
          </div>
          <div className="col-span-2 rounded-2xl bg-white/90 px-3 py-2 ring-1 ring-indigo-100/60 sm:col-span-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Next visit</p>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
              {nextVisit ? formatVisitChip(nextVisit.scheduled_for) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-indigo-100/90 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Upcoming visits</p>
          {upcoming.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {upcoming.slice(0, 8).map((v) => (
                <li
                  key={v.id}
                  className="flex flex-col gap-1 rounded-2xl bg-white/90 px-3 py-2.5 text-xs ring-1 ring-slate-200/45 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{formatVisitChip(v.scheduled_for)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
                      {v.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Reminders{" "}
                    {v.reminder_day_before_sent_at ? "day-before ✓" : "—"} ·{" "}
                    {v.reminder_day_of_sent_at ? "day-of ✓" : "—"}
                  </div>
                  {v.visit_note ? <p className="w-full text-[11px] text-slate-600">Note: {v.visit_note}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">None scheduled — add one using Schedule visit.</p>
          )}
        </div>
        <div className="mt-5 border-t border-indigo-100/90 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Visit execution</p>
          {visits.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {[...visits]
                .sort((a, b) => {
                  const ta = a.scheduled_for ? new Date(a.scheduled_for).getTime() : 0;
                  const tb = b.scheduled_for ? new Date(b.scheduled_for).getTime() : 0;
                  return tb - ta;
                })
                .slice(0, 6)
                .map((v) => {
                  const duration = onSiteDurationLabel(v.arrived_at, v.completed_at);
                  const locationCaptured =
                    (v.arrived_lat != null && v.arrived_lng != null) ||
                    (v.completed_lat != null && v.completed_lng != null);
                  return (
                    <li
                      key={`exec-${v.id}`}
                      className="rounded-2xl bg-white/90 px-3 py-2.5 text-xs ring-1 ring-slate-200/45"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          {v.scheduled_for ? formatVisitChip(v.scheduled_for) : "Unscheduled"}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">
                          {v.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                        {v.en_route_at ? <p>En route {formatAdminPhoneWhen(v.en_route_at)}</p> : null}
                        {v.arrived_at ? <p>Arrived {formatAdminPhoneWhen(v.arrived_at)}</p> : null}
                        {v.completed_at ? <p>Completed {formatAdminPhoneWhen(v.completed_at)}</p> : null}
                        {duration ? <p>On-site duration {duration}</p> : null}
                        {locationCaptured ? <p>Location captured</p> : null}
                      </div>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No visit execution updates yet.</p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-gradient-to-br from-violet-50/70 to-white p-4 ring-1 ring-violet-100/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-900/80">Voicemail</p>
            <p className="text-xs text-violet-950/55">Recent messages left on calls for this patient.</p>
          </div>
          <span className="rounded-full bg-violet-100/90 px-2.5 py-1 text-[10px] font-semibold text-violet-900">
            {vmCount} total
          </span>
        </div>
        {vmCalls.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No voicemails logged for this chart yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {vmCalls.slice(0, 8).map((c) => {
              const at =
                typeof c.started_at === "string" ? c.started_at : (c.created_at as string | undefined) ?? "";
              const vmSec =
                typeof c.voicemail_duration_seconds === "number" && Number.isFinite(c.voicemail_duration_seconds)
                  ? c.voicemail_duration_seconds
                  : typeof c.duration_seconds === "number"
                    ? c.duration_seconds
                    : null;
              const callbackPhone = voicemailCallbackNumber(c);
              return (
                <VoicemailCard
                  key={c.id}
                  callId={c.id}
                  title={name}
                  subtitle={callbackPhone ?? "Unknown number"}
                  whenLabel={at ? formatAdminPhoneWhen(at) : "—"}
                  durationLabel={formatDurationSeconds(vmSec)}
                  callbackPhone={callbackPhone}
                  threadHref={conversationId ? `/workspace/phone/inbox/${conversationId}` : null}
                  patientHref={`/workspace/phone/patients/${patientId}`}
                  transcript={voicemailTranscriptFromMeta(c.metadata)}
                  aiRecap={voiceAiShortSummaryFromMeta(c.metadata)}
                  compact
                />
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <PatientProfileEditForm patientId={patientId} initial={profileInitial} />

        <PatientHubClient
          patientId={patientId}
          primaryPhone={primaryPhone}
          secondaryPhone={secondaryPhone}
          conversationId={conversationId}
          copy={quickCopy}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl bg-gradient-to-br from-violet-50/80 to-white p-4 ring-1 ring-violet-100/70">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-800/80">AI insight</p>
          {aiMini.summary ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{aiMini.summary}</p>
          ) : voiceAiCall?.short_summary ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{voiceAiCall.short_summary}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No AI summary yet for this chart.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {(aiMini.category || voiceAiCall?.caller_category) ? (
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                {(aiMini.category || voiceAiCall?.caller_category || "").replace(/_/g, " ")}
              </span>
            ) : null}
            {(aiMini.urgency || voiceAiCall?.urgency) ? (
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                {aiMini.urgency || voiceAiCall?.urgency}
              </span>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl bg-white/95 p-4 shadow-sm shadow-slate-200/40 ring-1 ring-slate-200/50">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Latest call CRM</p>
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            <p>
              <span className="text-slate-500">Type </span>
              {formatCrmTypeLabel(crmCall.type) ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Outcome </span>
              {formatCrmOutcomeLabel(crmCall.outcome) ?? "—"}
            </p>
            {crmCall.tags ? (
              <p>
                <span className="text-slate-500">Tags </span>
                {crmCall.tags}
              </p>
            ) : null}
            {crmCall.note ? <p className="text-slate-600">{crmCall.note}</p> : null}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-3xl bg-white/90 p-4 shadow-sm shadow-slate-200/40 ring-1 ring-slate-200/50">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Communication timeline</h2>
          <span className="text-[10px] font-medium text-slate-400">Calls &amp; texts</span>
        </div>
        <ul className="mt-3 space-y-3">
          {timeline.length === 0 ? (
            <li className="text-sm text-slate-500">No calls or texts logged yet.</li>
          ) : (
            timeline.map((e, i) => (
              <li key={`${e.kind}-${e.at}-${i}`} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 text-[11px] text-slate-400">{formatAdminPhoneWhen(e.at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">
                    {e.kind === "sms" ? e.label : e.label}
                    {e.kind === "call" && e.hasVm ? (
                      <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
                        Voicemail
                      </span>
                    ) : null}
                  </p>
                  {e.kind === "sms" ? (
                    <p className="mt-0.5 text-slate-600">{e.body}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500">{e.sub}</p>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl bg-slate-50/80 px-3 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-slate-200/40">
        <p className="font-semibold text-slate-600">Automated reminders</p>
        <p className="mt-1">
          Day-before and day-of SMS run from scheduled visits (see upcoming list). Ops schedules{" "}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px] text-slate-700">POST /api/cron/visit-reminders</code>{" "}
          with <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">VISIT_REMINDER_CRON_SECRET</code>.
        </p>
      </section>
    </div>
  );
}
