import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CrmVisitStatusForm } from "../_components/CrmVisitStatusForm";
import { PayerTypeSelect } from "@/components/crm/PayerTypeSelect";
import { SearchablePayerSelect } from "@/components/crm/SearchablePayerSelect";
import { ServiceDisciplineCheckboxes } from "@/components/crm/ServiceDisciplineCheckboxes";
import { PatientAssignmentsSection } from "./_components/PatientAssignmentsSection";
import {
  deleteCrmPatientIfAllowed,
  movePatientBackToLeadStage,
  setCrmPatientArchive,
  setCrmPatientIsTest,
  updateCrmPatientCoreProfile,
  updatePatientIntake,
} from "../../actions";
import { CrmCommunicationTimeline } from "../../_components/CrmCommunicationTimeline";
import { CrmStageBadge } from "../../_components/CrmStageBadge";
import { CrmPatientStageMovedBanner } from "../_components/CrmPatientStageMovedBanner";
import { readCrmMetadata, formatCrmTypeLabel, formatCrmOutcomeLabel } from "@/app/admin/phone/_lib/crm-metadata";
import { readVoiceAiMetadata } from "@/app/admin/phone/_lib/voice-ai-metadata";
import type { PhoneCallRow } from "@/app/admin/phone/recent-calls-live";
import { parseVoiceAiMini, formatVisitChip, formatDurationSeconds } from "@/lib/crm/patient-hub-detail-display";
import { buildCrmCommunicationTimelineModel } from "@/lib/crm/build-crm-communication-timeline-model";
import type { LeadActivityRow } from "@/lib/crm/lead-activities-timeline";
import type { CrmStage } from "@/lib/crm/crm-stage";
import { normalizeCrmStage } from "@/lib/crm/crm-stage";
import { formatVisitStatusLabel } from "@/lib/crm/patient-visit-status";
import {
  buildCaregiverAlternateSummary,
  hasDoctorOfficeDisplayInfo,
} from "@/lib/crm/patient-caregiver-display";
import { FormattedPhoneInput } from "@/components/phone/FormattedPhoneInput";
import { supabaseAdmin } from "@/lib/admin";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { formatAdminPhoneWhen } from "@/app/workspace/phone/patients/_lib/patient-hub";

type ContactEmb = {
  id?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
  secondary_phone?: string | null;
  relationship_metadata?: unknown;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

function contactDisplayName(c: ContactEmb | null): string {
  if (!c) return "—";
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function reminderRecipientLabel(r: string | null): string {
  if (r === "caregiver") return "Caregiver";
  if (r === "both") return "Patient & caregiver";
  return "Patient";
}

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

type AuditRow = {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
};

function formatAuditAction(action: string, meta: Record<string, unknown> | null): string {
  if (action === "workspace_patient_sms_sent") {
    const preset = meta?.preset;
    if (preset === "on_my_way") return "SMS · On my way (workspace)";
    return "SMS sent (workspace)";
  }
  if (action === "crm_patient_profile_update") return "Profile updated (CRM)";
  if (action === "workspace_patient_profile_update") return "Profile updated (workspace)";
  if (action === "workspace_patient_sms_failed") return "SMS failed (workspace)";
  if (action === "crm_patient_sms_sent") return "SMS sent (CRM)";
  if (action === "crm_patient_sms_failed") return "SMS failed (CRM)";
  return action.replace(/_/g, " ");
}

type VisitRow = {
  id: string;
  scheduled_for: string | null;
  status: string;
  visit_note: string | null;
  reminder_recipient: string | null;
  reminder_day_before_sent_at: string | null;
  reminder_day_of_sent_at: string | null;
  created_at: string;
};

export default async function PatientIntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = searchParams ? await searchParams : {};
  const smsFlash = typeof sp.sms === "string" ? sp.sms : Array.isArray(sp.sms) ? sp.sms[0] : undefined;
  const smsErrRaw =
    typeof sp.smsErr === "string" ? sp.smsErr : Array.isArray(sp.smsErr) ? sp.smsErr[0] : undefined;
  const patientDeleteErrorRaw =
    typeof sp.patientDeleteError === "string"
      ? sp.patientDeleteError
      : Array.isArray(sp.patientDeleteError)
        ? sp.patientDeleteError[0]
        : undefined;
  const patientDeleteError =
    typeof patientDeleteErrorRaw === "string" ? decodeURIComponent(patientDeleteErrorRaw.trim()) : "";

  const crmStageMovedRaw =
    typeof sp.crmStageMoved === "string"
      ? sp.crmStageMoved
      : Array.isArray(sp.crmStageMoved)
        ? sp.crmStageMoved[0]
        : "";
  const movedLeadIdFromQuery =
    typeof sp.leadId === "string" ? sp.leadId : Array.isArray(sp.leadId) ? sp.leadId[0] : "";
  const prevStageFromQuery =
    typeof sp.prevStage === "string" ? sp.prevStage : Array.isArray(sp.prevStage) ? sp.prevStage[0] : "";
  const showMovedBanner = crmStageMovedRaw === "1" && movedLeadIdFromQuery.trim() && prevStageFromQuery.trim();

  const { patientId } = await params;
  if (!patientId?.trim()) {
    notFound();
  }

  const pid = patientId.trim();

  const { data: row, error } = await supabaseAdmin
    .from("patients")
    .select(
      `
      id,
      contact_id,
      archived_at,
      is_test,
      notes,
      patient_status,
      physician_name,
      referring_doctor_name,
      doctor_office_name,
      doctor_office_phone,
      doctor_office_fax,
      doctor_office_contact_person,
      referring_provider_name,
      referring_provider_phone,
      payer_name,
      payer_type,
      referral_source,
      service_type,
      service_disciplines,
      intake_status,
      visit_plan_summary,
      visit_plan_target_total,
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
    .eq("id", pid)
    .maybeSingle();

  if (error || !row?.id) {
    notFound();
  }

  const cr = row.contacts as ContactEmb | ContactEmb[] | null;
  const c = Array.isArray(cr) ? cr[0] : cr;

  const P = row as Record<string, unknown>;
  const contactId =
    (typeof c?.id === "string" && c.id.trim() ? c.id.trim() : null) ||
    (typeof P.contact_id === "string" ? P.contact_id.trim() : "");

  const patientNotesRaw = typeof P.notes === "string" ? P.notes : "";

  const serviceDisciplinesRaw = Array.isArray(P.service_disciplines)
    ? (P.service_disciplines as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const serviceTypeLegacy = typeof P.service_type === "string" ? P.service_type.trim() : "";
  const serviceDisciplinesForForm =
    serviceDisciplinesRaw.length > 0
      ? serviceDisciplinesRaw
      : serviceTypeLegacy
        ? serviceTypeLegacy.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

  const { data: visitData } = await supabaseAdmin
    .from("patient_visits")
    .select(
      "id, scheduled_for, status, visit_note, reminder_recipient, reminder_day_before_sent_at, reminder_day_of_sent_at, created_at"
    )
    .eq("patient_id", pid)
    .order("scheduled_for", { ascending: true, nullsFirst: false });

  const visits = (visitData ?? []) as VisitRow[];

  const now = new Date().getTime();
  const completedVisits = visits.filter((v) => v.status === "completed");
  const completedCount = completedVisits.length;
  const targetTotal =
    typeof P.visit_plan_target_total === "number" && Number.isFinite(P.visit_plan_target_total)
      ? P.visit_plan_target_total
      : null;
  const remainingVisits = targetTotal != null ? Math.max(0, targetTotal - completedCount) : null;

  const upcomingStatuses = new Set(["scheduled", "confirmed", "en_route"]);
  const upcoming = visits.filter((v) => {
    if (!v.scheduled_for || !upcomingStatuses.has(v.status)) return false;
    const t = new Date(v.scheduled_for).getTime();
    return !Number.isNaN(t) && t >= now;
  });
  const nextVisit = upcoming[0] ?? null;

  const planSummary =
    typeof P.visit_plan_summary === "string" ? P.visit_plan_summary.trim() : "";

  const { data: conv } = contactId
    ? await supabaseAdmin
        .from("conversations")
        .select("id, last_message_at, metadata, lead_status")
        .eq("channel", "sms")
        .eq("primary_contact_id", contactId)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  const conversationId = conv?.id ? String(conv.id) : null;
  const aiMini = parseVoiceAiMini(conv?.metadata);

  const { data: callRows } = contactId
    ? await supabaseAdmin
        .from("phone_calls")
        .select(
          "id, direction, status, started_at, from_e164, to_e164, voicemail_recording_sid, voicemail_duration_seconds, metadata, duration_seconds, created_at"
        )
        .eq("contact_id", contactId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(25)
    : { data: null };

  const calls = (callRows ?? []) as unknown as PhoneCallRow[];

  const vmCalls = calls.filter(
    (call) => typeof call.voicemail_recording_sid === "string" && call.voicemail_recording_sid.trim() !== ""
  );
  const vmCount = vmCalls.length;

  const { data: leadRowsForContact } = contactId
    ? await supabaseAdmin
        .from("leads")
        .select("id, crm_stage, last_note")
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: null };

  const leadsList = (leadRowsForContact ?? []) as {
    id: string;
    crm_stage: string | null;
    last_note: string | null;
  }[];
  const patientStageLead =
    leadsList.find((r) => normalizeCrmStage(r.crm_stage) === "patient") ?? leadsList[0] ?? null;
  const timelineLeadId = patientStageLead?.id ?? null;
  const lastNoteForTimeline =
    typeof patientStageLead?.last_note === "string" ? patientStageLead.last_note : "";

  let initialActivitiesForTimeline: LeadActivityRow[] = [];
  if (timelineLeadId) {
    const activityRes = await supabaseAdmin
      .from("lead_activities")
      .select("id, lead_id, event_type, body, metadata, created_at, created_by_user_id, deleted_at, deletable")
      .eq("lead_id", timelineLeadId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    initialActivitiesForTimeline = (activityRes.data ?? []) as LeadActivityRow[];
  }

  const communicationTimelineRows = contactId
    ? await buildCrmCommunicationTimelineModel({
        contactId,
        leadId: timelineLeadId,
        workspaceSmsConversationId: conversationId,
        lastNote: lastNoteForTimeline,
        leadActivities: initialActivitiesForTimeline,
      })
    : [];

  const showMoveBackToLead = Boolean(
    patientStageLead?.id && normalizeCrmStage(patientStageLead.crm_stage) === "patient"
  );

  const latestForAi = calls[0] ?? null;
  const voiceAiCall = latestForAi ? readVoiceAiMetadata(latestForAi) : null;
  const crmCall = latestForAi ? readCrmMetadata(latestForAi) : readCrmMetadata(null);

  const { data: asnRows } = await supabaseAdmin
    .from("patient_assignments")
    .select("id, role, assigned_user_id, is_active, discipline, is_primary")
    .eq("patient_id", pid)
    .eq("is_active", true);

  const uids = [...new Set((asnRows ?? []).map((a) => a.assigned_user_id).filter(Boolean))] as string[];
  const { data: staffRows } =
    uids.length > 0
      ? await supabaseAdmin.from("staff_profiles").select("user_id, email, full_name").in("user_id", uids)
      : { data: [] };

  const staffByUser = new Map((staffRows ?? []).map((s) => [s.user_id, s]));

  const { data: allStaffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role, full_name")
    .order("email", { ascending: true });

  const staffOptions = (allStaffRows ?? []) as {
    user_id: string;
    email: string | null;
    role: string;
    full_name: string | null;
  }[];

  const { data: auditRows } = await supabaseAdmin
    .from("audit_log")
    .select("id, created_at, actor_email, action, metadata")
    .eq("entity_type", "patient")
    .eq("entity_id", pid)
    .order("created_at", { ascending: false })
    .limit(40);

  const audits = (auditRows ?? []) as AuditRow[];

  const lastWorkspaceProfile = audits.find((a) => a.action === "workspace_patient_profile_update");
  const patientStatus =
    typeof P.patient_status === "string" && P.patient_status.trim()
      ? P.patient_status.replace(/_/g, " ")
      : null;

  const visitsForTable = [...visits].sort((a, b) => {
    const ta = a.scheduled_for ? new Date(a.scheduled_for).getTime() : 0;
    const tb = b.scheduled_for ? new Date(b.scheduled_for).getTime() : 0;
    return tb - ta;
  });

  const returnToPatient = `/admin/crm/patients/${pid}`;

  const archivedAt = typeof P.archived_at === "string" ? P.archived_at.trim() : null;
  const isArchived = Boolean(archivedAt);
  const isTestPatient = P.is_test === true;

  const caregiverSummary = buildCaregiverAlternateSummary({
    secondaryPhone: (c?.secondary_phone as string | null | undefined) ?? null,
    relationshipMetadata: c?.relationship_metadata,
  });

  const doctorOffice = {
    physician_name: typeof P.physician_name === "string" ? P.physician_name : null,
    referring_doctor_name: typeof P.referring_doctor_name === "string" ? P.referring_doctor_name : null,
    doctor_office_name: typeof P.doctor_office_name === "string" ? P.doctor_office_name : null,
    doctor_office_phone: typeof P.doctor_office_phone === "string" ? P.doctor_office_phone : null,
    doctor_office_fax: typeof P.doctor_office_fax === "string" ? P.doctor_office_fax : null,
    doctor_office_contact_person: typeof P.doctor_office_contact_person === "string" ? P.doctor_office_contact_person : null,
  };
  const showDoctorOffice = hasDoctorOfficeDisplayInfo(doctorOffice);

  const crmStageForPatientBadge: CrmStage =
    leadsList.length === 0 ? "patient" : normalizeCrmStage((patientStageLead ?? leadsList[0])?.crm_stage);

  return (
    <div className="space-y-6 p-6">
      {smsFlash ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            smsFlash === "sent"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : smsFlash === "failed"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
        >
          {smsFlash === "sent"
            ? "On-my-way SMS was sent when this visit moved to En route."
            : smsFlash === "failed"
              ? `On-my-way SMS failed: ${smsErrRaw ?? "Unknown error"}`
              : "Visit moved to En route; SMS was not sent (unchecked or skipped)."}
        </div>
      ) : null}

      {patientDeleteError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {patientDeleteError}
        </div>
      ) : null}

      {showMovedBanner ? (
        <CrmPatientStageMovedBanner
          patientId={pid}
          movedLeadId={movedLeadIdFromQuery.trim()}
          previousStage={normalizeCrmStage(prevStageFromQuery)}
        />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Record management</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
          <strong>Archive</strong> soft-hides the patient from default CRM/workspace lists; visits, SMS, and calls stay
          linked. Use <strong>Test / sandbox</strong> to tag charts that should stay out of normal production views.{" "}
          <strong>Delete permanently</strong> is only offered when there are zero dispatch visits, assignments, and
          payroll visit rows — otherwise archive instead.
        </p>
        {showMoveBackToLead ? (
          <form action={movePatientBackToLeadStage} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
            <input type="hidden" name="patientId" value={pid} />
            <p className="text-xs font-semibold text-amber-950">CRM stage</p>
            <p className="mt-1 max-w-2xl text-[11px] text-amber-900/90">
              Move the linked lead back to Lead stage. The patient chart and all communication history stay attached.
            </p>
            <button
              type="submit"
              className="mt-3 rounded-lg border border-amber-700 bg-white px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100"
            >
              Move back to Lead
            </button>
          </form>
        ) : null}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <form action={setCrmPatientArchive} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="patientId" value={pid} />
            <input type="hidden" name="afterAction" value="stay" />
            <input type="hidden" name="archiveAction" value={isArchived ? "unarchive" : "archive"} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Archive</span>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              {isArchived ? "Restore to active lists" : "Archive patient"}
            </button>
            {isArchived ? (
              <span className="text-xs text-amber-800">This chart is archived (hidden from default lists).</span>
            ) : null}
          </form>
          <form action={setCrmPatientIsTest} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="patientId" value={pid} />
            <input type="hidden" name="afterAction" value="stay" />
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-600">
              Record type
              <select
                name="is_test"
                defaultValue={isTestPatient ? "1" : "0"}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
              >
                <option value="0">Production</option>
                <option value="1">Test / sandbox</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Save
            </button>
          </form>
          <form action={deleteCrmPatientIfAllowed} className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <input type="hidden" name="patientId" value={pid} />
            <button
              type="submit"
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 shadow-sm hover:bg-rose-50"
            >
              Delete patient permanently…
            </button>
            <p className="mt-2 max-w-md text-[11px] text-slate-500">
              Allowed only when there are no patient visits, assignments, or payroll visit rows. You will see an error
              here if anything still references this chart.
            </p>
          </form>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <CrmStageBadge stage={crmStageForPatientBadge} />
      </div>

      <AdminPageHeader
        eyebrow="Patients"
        title={contactDisplayName(c ?? null)}
        description={
          <>
            {patientStatus ? <span className="capitalize">{patientStatus}</span> : "—"}
            {serviceDisciplinesForForm.length > 0 ? (
              <>
                {" · "}
                <span className="text-slate-500">Services:</span> {serviceDisciplinesForForm.join(", ")}
              </>
            ) : null}
            {" · "}
            <Link href={`/admin/crm/patients/${pid}/visits`} className="font-semibold text-sky-800 hover:underline">
              Visits list
            </Link>
            {" · "}
            <Link
              href={`/admin/crm/dispatch?patient=${encodeURIComponent(pid)}`}
              className="font-semibold text-sky-800 hover:underline"
            >
              Dispatch
            </Link>
            {" · "}
            <Link href={`/workspace/phone/patients/${pid}`} className="font-semibold text-sky-800 hover:underline">
              Nurse workspace view
            </Link>
            {" · "}
            <Link href="/admin/crm/patients" className="font-semibold text-sky-800 hover:underline">
              All patients
            </Link>
          </>
        }
      />

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Patient profile</h2>
        <p className="mt-1 text-xs text-slate-500">Same chart context as the nurse hub — read-only summary; edit in the form below.</p>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Address</p>
          <div className="mt-1 text-sm leading-relaxed text-slate-800">
            {(() => {
              const line1 = (c?.address_line_1 as string | null | undefined)?.trim() ?? "";
              const line2 = (c?.address_line_2 as string | null | undefined)?.trim() ?? "";
              const city = (c?.city as string | null | undefined)?.trim() ?? "";
              const state = (c?.state as string | null | undefined)?.trim() ?? "";
              const zip = (c?.zip as string | null | undefined)?.trim() ?? "";
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
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Patient phone</dt>
            <dd className="mt-0.5 text-sm tabular-nums text-slate-900">
              {formatPhoneForDisplay((c?.primary_phone as string | null) ?? "")}
            </dd>
          </div>
          <div className="sm:col-span-1">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Caregiver / alternate
            </dt>
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
              {caregiverSummary.isEmpty ? (
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Saved on the CRM contact as <span className="font-medium">Caregiver / alternate phone</span> below
                  (used for caregiver SMS). Optional names can live in contact metadata keys such as{" "}
                  <span className="font-mono text-[10px]">caregiver_name</span> /{" "}
                  <span className="font-mono text-[10px]">caregiver_phone</span>.
                </p>
              ) : null}
            </dd>
          </div>
        </dl>

        {showDoctorOffice ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Doctor / office (referral)</p>
            <p className="mt-1 text-[11px] text-slate-500">
              From intake — not the same as the patient&apos;s home caregiver line above.
            </p>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {(doctorOffice.physician_name ?? "").trim() || (doctorOffice.referring_doctor_name ?? "").trim() ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Treating / referring physician</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {(doctorOffice.physician_name ?? "").trim() ||
                      (doctorOffice.referring_doctor_name ?? "").trim() ||
                      "—"}
                  </dd>
                </div>
              ) : null}
              {(doctorOffice.doctor_office_name ?? "").trim() ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Practice / clinic</dt>
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
              {(doctorOffice.doctor_office_fax ?? "").trim() ? (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Office fax</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-800">
                    {formatPhoneForDisplay(doctorOffice.doctor_office_fax ?? "")}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}

        {patientNotesRaw.trim() ? (
          <div className="mt-4 rounded-xl bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 ring-1 ring-amber-100/80">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/90">Operational notes</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{patientNotesRaw.trim()}</p>
          </div>
        ) : null}

        {vmCount > 0 ? (
          <p className="mt-3 text-xs text-violet-800">
            {vmCount} voicemail{vmCount === 1 ? "" : "s"} on file — see Voicemail below.
          </p>
        ) : null}
      </div>

      <PatientAssignmentsSection
        patientId={pid}
        staffOptions={staffOptions}
        assignments={(asnRows ?? []) as { id: string; role: string; assigned_user_id: string | null; discipline: string | null; is_primary: boolean | null }[]}
        staffByUser={staffByUser}
      />

      <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-5 shadow-sm ring-1 ring-indigo-100/70">
        <h2 className="text-sm font-semibold text-slate-900">Visit plan &amp; frequency</h2>
        <p className="mt-1 text-xs text-slate-600">Targets shared with the nurse workspace.</p>
        {planSummary ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{planSummary}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No visit plan summary yet.</p>
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
          <div className="rounded-2xl bg-white/90 px-3 py-2 ring-1 ring-indigo-100/60">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Next visit</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {nextVisit ? formatVisitChip(nextVisit.scheduled_for) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-indigo-100/90 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Upcoming visits</p>
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
                      {formatVisitStatusLabel(v.status)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Reminders to {reminderRecipientLabel(v.reminder_recipient)} · day-before{" "}
                    {v.reminder_day_before_sent_at ? "sent" : "—"} · day-of {v.reminder_day_of_sent_at ? "sent" : "—"}
                  </div>
                  {v.visit_note ? <p className="w-full text-[11px] text-slate-600">Note: {v.visit_note}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">None scheduled.</p>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-5 shadow-sm ring-1 ring-violet-100/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Voicemail</h2>
            <p className="mt-0.5 text-xs text-slate-600">Recent messages left on calls for this patient.</p>
          </div>
          <span className="rounded-full bg-violet-100/90 px-2.5 py-1 text-[10px] font-semibold text-violet-900">
            {vmCount} total
          </span>
        </div>
        {vmCalls.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No voicemails logged for this chart yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {vmCalls.slice(0, 8).map((call) => {
              const at =
                typeof call.started_at === "string" ? call.started_at : (call.created_at as string | undefined) ?? "";
              const vmSec =
                typeof call.voicemail_duration_seconds === "number" && Number.isFinite(call.voicemail_duration_seconds)
                  ? call.voicemail_duration_seconds
                  : typeof call.duration_seconds === "number"
                    ? call.duration_seconds
                    : null;
              return (
                <li
                  key={call.id}
                  className="flex flex-col gap-2 rounded-2xl bg-white/90 px-3 py-2.5 text-xs ring-1 ring-violet-100/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900">{at ? formatAdminPhoneWhen(at) : "—"}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Duration {formatDurationSeconds(vmSec)} · {String(call.direction)} · {String(call.status)}
                    </p>
                  </div>
                  <Link
                    href={`/admin/phone/${call.id}`}
                    className="shrink-0 text-[11px] font-semibold text-violet-900 underline-offset-2 hover:underline"
                  >
                    Open call detail
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Visit status &amp; reminders</h2>
        <p className="mt-1 text-xs text-slate-500">
          Operational states and automated reminder tracking. Use status transitions that match the field workflow.
        </p>
        {visitsForTable.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No visits yet — add from the visits page or nurse workspace.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Scheduled</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Reminder to</th>
                  <th className="py-2 pr-3">Day-before</th>
                  <th className="py-2 pr-3">Day-of</th>
                  <th className="py-2 pr-3">Note</th>
                  <th className="py-2">Update</th>
                </tr>
              </thead>
              <tbody>
                {visitsForTable.slice(0, 30).map((v) => (
                  <tr key={v.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium text-slate-900">{formatVisitChip(v.scheduled_for)}</td>
                    <td className="py-2 pr-3 capitalize text-slate-700">{formatVisitStatusLabel(v.status)}</td>
                    <td className="py-2 pr-3">{reminderRecipientLabel(v.reminder_recipient)}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {v.reminder_day_before_sent_at
                        ? new Date(v.reminder_day_before_sent_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {v.reminder_day_of_sent_at
                        ? new Date(v.reminder_day_of_sent_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 max-w-[12rem] text-slate-600">{v.visit_note ?? "—"}</td>
                    <td className="py-2">
                      <CrmVisitStatusForm visitId={v.id} currentStatus={v.status} returnTo={returnToPatient} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-5 shadow-sm ring-1 ring-violet-100/70">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-800/80">AI insight</p>
          {aiMini.summary ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{aiMini.summary}</p>
          ) : voiceAiCall?.short_summary ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{voiceAiCall.short_summary}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No AI summary yet for this chart.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {aiMini.category || voiceAiCall?.caller_category ? (
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                {(aiMini.category || voiceAiCall?.caller_category || "").replace(/_/g, " ")}
              </span>
            ) : null}
            {aiMini.urgency || voiceAiCall?.urgency ? (
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                {aiMini.urgency || voiceAiCall?.urgency}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
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
        </div>
      </div>

      {!contactId ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-amber-800">No contact linked — communication timeline unavailable.</p>
        </div>
      ) : (
        <CrmCommunicationTimeline
          rows={communicationTimelineRows}
          leadId={timelineLeadId}
          emptyHint="No SMS, calls, or notes on this thread yet."
        />
      )}

      {lastWorkspaceProfile ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-950">Latest nurse field edit (workspace)</h2>
          <p className="mt-1 text-xs text-amber-900/80">
            {new Date(lastWorkspaceProfile.created_at).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {lastWorkspaceProfile.actor_email ? ` · ${lastWorkspaceProfile.actor_email}` : ""}
          </p>
          {(() => {
            const meta = lastWorkspaceProfile.metadata ?? {};
            const changes = Array.isArray(meta.changes)
              ? (meta.changes as { field: string; before: string | null; after: string | null }[])
              : [];
            if (changes.length === 0) {
              return <p className="mt-2 text-sm text-amber-900/90">Fields updated (see full log below).</p>;
            }
            return (
              <ul className="mt-2 space-y-1 text-xs text-amber-950">
                {changes.map((ch, i) => (
                  <li key={i}>
                    <span className="font-mono text-[10px]">{ch.field}</span> changed
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ) : null}

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Patient profile &amp; visit plan (edit)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Edits are logged with before/after for review. Operational notes are visible to assigned nurses.
        </p>
        <form action={updateCrmPatientCoreProfile} className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
          <input type="hidden" name="patientId" value={pid} />
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Full name
            <input name="full_name" className={inp} defaultValue={(c?.full_name as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            First name
            <input name="first_name" className={inp} defaultValue={(c?.first_name as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Last name
            <input name="last_name" className={inp} defaultValue={(c?.last_name as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Patient phone
            <FormattedPhoneInput
              name="primary_phone"
              className={inp}
              defaultValue={(c?.primary_phone as string | null) ?? ""}
              autoComplete="tel"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Caregiver / alternate phone
            <FormattedPhoneInput
              name="secondary_phone"
              className={inp}
              defaultValue={(c?.secondary_phone as string | null) ?? ""}
              autoComplete="tel"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Address line 1
            <input name="address_line_1" className={inp} defaultValue={(c?.address_line_1 as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Address line 2
            <input name="address_line_2" className={inp} defaultValue={(c?.address_line_2 as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            City
            <input name="city" className={inp} defaultValue={(c?.city as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            State
            <input name="state" className={inp} defaultValue={(c?.state as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            ZIP
            <input name="zip" className={inp} defaultValue={(c?.zip as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Operational notes
            <textarea
              name="patient_notes"
              rows={4}
              className={inp}
              defaultValue={patientNotesRaw}
              placeholder="Visible to nurses and managers on the patient hub."
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Visit plan frequency (summary)
            <textarea
              name="visit_plan_summary"
              rows={3}
              className={inp}
              defaultValue={(P.visit_plan_summary as string | null) ?? ""}
              placeholder="e.g. 2×/week × 2 weeks, then 1×/week × 2 weeks"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Planned visit total (optional)
            <input
              name="visit_plan_target_total"
              type="number"
              min={0}
              className={inp}
              defaultValue={
                P.visit_plan_target_total !== null && P.visit_plan_target_total !== undefined
                  ? String(P.visit_plan_target_total)
                  : ""
              }
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded border border-sky-600 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Save profile &amp; plan
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Referral &amp; payer intake</h2>
        <form action={updatePatientIntake} className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
          <input type="hidden" name="patientId" value={pid} />
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Referring provider name
            <input
              name="referring_provider_name"
              className={inp}
              defaultValue={(P.referring_provider_name as string | null) ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Referring provider phone
            <FormattedPhoneInput
              name="referring_provider_phone"
              className={inp}
              defaultValue={(P.referring_provider_phone as string | null) ?? ""}
              autoComplete="tel"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Payer
            <SearchablePayerSelect defaultValue={(P.payer_name as string | null) ?? ""} className={inp} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Payer type (category)
            <PayerTypeSelect name="payer_type" className={inp} defaultValue={(P.payer_type as string | null) ?? ""} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Referral source
            <input
              name="referral_source"
              className={inp}
              defaultValue={(P.referral_source as string | null) ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Service disciplines
            <ServiceDisciplineCheckboxes defaultSelected={serviceDisciplinesForForm} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
            Intake status
            <input name="intake_status" className={inp} defaultValue={(P.intake_status as string | null) ?? ""} />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded border border-sky-600 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Save
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
        <p className="mt-1 text-xs text-slate-500">
          Audit log (CRM and workspace). Profile rows include field-level diffs when available.
        </p>
        {audits.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No logged events yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {audits.map((a) => {
              const meta = a.metadata ?? {};
              const changes = Array.isArray(meta.changes)
                ? (meta.changes as { field: string; before: string | null; after: string | null }[])
                : [];

              return (
                <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-medium text-slate-800">{formatAuditAction(a.action, meta as Record<string, unknown>)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(a.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    {a.actor_email ? ` · ${a.actor_email}` : ""}
                  </p>
                  {meta.preset === "on_my_way" && typeof meta.nurse_label === "string" ? (
                    <p className="mt-1 text-xs text-slate-600">Nurse: {meta.nurse_label}</p>
                  ) : null}
                  {changes.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {changes.map((ch, i) => (
                        <li key={i}>
                          <span className="font-mono text-[10px] text-slate-500">{ch.field}</span>{" "}
                          <span className="text-slate-400">{ch.before ?? "—"}</span> →{" "}
                          <span className="text-slate-800">{ch.after ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
