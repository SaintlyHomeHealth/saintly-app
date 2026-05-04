import Link from "next/link";
import { redirect } from "next/navigation";

import {
  reassignDispatchVisit,
  rescheduleDispatchVisit,
  sendDispatchVisitClinicianSms,
  sendDispatchVisitPatientSms,
  setPatientVisitStatus,
} from "../actions";
import { supabaseAdmin } from "@/lib/admin";
import { formatDispatchScheduleLine, visitOverlapsLocalDay } from "@/lib/crm/dispatch-visit";
import { VISIT_STATUS_TRANSITIONS } from "@/lib/crm/patient-visit-status";
import { formatPhoneForDisplay, normalizePhone } from "@/lib/phone/us-phone-format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { visitNeedsAttentionOperational } from "@/lib/crm/dispatch-needs-attention";
import { buildDispatchVisitTimeSlots } from "@/lib/crm/dispatch-time-slots";
import { addCalendarDaysToIsoDate } from "@/lib/crm/crm-local-date";
import { appCalendarMidnightUtc, formatAppCalendarYmd } from "@/lib/datetime/app-timezone";
import { CopyAddressButton } from "./CopyAddressButton";
import { ScheduleVisitModal } from "./ScheduleVisitModal";

type ContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

type VisitRow = {
  id: string;
  patient_id: string;
  assigned_user_id: string | null;
  scheduled_for: string | null;
  scheduled_end_at: string | null;
  time_window_label: string | null;
  status: string;
  created_at: string;
  visit_note: string | null;
  patient_phone_snapshot: string | null;
  address_snapshot: string | null;
  dispatch_patient_notified_at: string | null;
  dispatch_clinician_notified_at: string | null;
  notify_patient_on_schedule: boolean | null;
  notify_clinician_on_schedule: boolean | null;
  reminder_day_before_sent_at: string | null;
  reminder_day_of_sent_at: string | null;
  patients:
    | {
        id: string;
        contact_id: string;
        contacts: ContactEmb | ContactEmb[] | null;
      }
    | {
        id: string;
        contact_id: string;
        contacts: ContactEmb | ContactEmb[] | null;
      }[]
    | null;
};

const RETURN_DISPATCH = "/admin/crm/dispatch";

const btnPrimary =
  "rounded border border-sky-600 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100";
const btnGreen =
  "rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100";
const btnMuted = "rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100";
const selectCls =
  "max-w-[9rem] rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800";

const BUCKET_ORDER = [
  "scheduled",
  "confirmed",
  "en_route",
  "arrived",
  "completed",
  "canceled",
  "needs_attention",
] as const;

type BucketKey = (typeof BUCKET_ORDER)[number];

const BUCKET_LABELS: Record<BucketKey, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  en_route: "En route",
  arrived: "Arrived",
  completed: "Completed",
  canceled: "Canceled",
  needs_attention: "Needs attention",
};

const RESCHEDULE_TIME_SLOTS = buildDispatchVisitTimeSlots();

function contactName(c: ContactEmb | null): string {
  if (!c) return "—";
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function normalizeContact(raw: ContactEmb | ContactEmb[] | null | undefined): ContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function normalizePatientEmb(raw: VisitRow["patients"]): {
  id: string;
  contact_id: string;
  contacts: ContactEmb | null;
} | null {
  if (!raw) return null;
  const p = Array.isArray(raw) ? raw[0] : raw;
  if (!p?.id) return null;
  return {
    id: p.id,
    contact_id: p.contact_id,
    contacts: normalizeContact(p.contacts ?? null),
  };
}

function addressFromContact(c: ContactEmb | null): string {
  if (!c) return "";
  const line1 = (c.address_line_1 ?? "").trim();
  const line2 = (c.address_line_2 ?? "").trim();
  const city = (c.city ?? "").trim();
  const state = (c.state ?? "").trim();
  const zip = (c.zip ?? "").trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [line1, line2, cityLine].filter(Boolean).join(", ");
}

function displayPhone(v: VisitRow, c: ContactEmb | null): string {
  const snap = (v.patient_phone_snapshot ?? "").trim();
  if (snap) return snap;
  return (c?.primary_phone ?? "").trim();
}

function displayAddress(v: VisitRow, c: ContactEmb | null): string {
  const snap = (v.address_snapshot ?? "").trim();
  if (snap) return snap;
  return addressFromContact(c);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function telHref(raw: string): string | null {
  const d = normalizePhone(raw);
  if (d.length === 10) return `tel:+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `tel:+${d}`;
  if (d.length > 0) return `tel:+${d}`;
  return null;
}

function mapsHrefFromAddress(addr: string): string | null {
  const t = addr.trim();
  if (!t) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t)}`;
}

function needsAttentionVisit(v: VisitRow, nowMs: number): boolean {
  return visitNeedsAttentionOperational(
    {
      status: v.status,
      assigned_user_id: v.assigned_user_id,
      scheduled_for: v.scheduled_for,
      scheduled_end_at: v.scheduled_end_at,
    },
    nowMs
  );
}

function primaryBucket(v: VisitRow, nowMs: number): BucketKey {
  if (needsAttentionVisit(v, nowMs)) return "needs_attention";
  if (v.status === "en_route") return "en_route";
  if (v.status === "arrived") return "arrived";
  if (v.status === "completed") return "completed";
  if (v.status === "canceled") return "canceled";
  if (v.status === "confirmed") return "confirmed";
  if (v.status === "scheduled") return "scheduled";
  return "needs_attention";
}

function VisitStatusActions({ visitId, status }: { visitId: string; status: string }) {
  const st = status;
  const allowed = VISIT_STATUS_TRANSITIONS[st] ?? [];
  return (
    <div className="flex flex-wrap gap-1">
      {st === "scheduled" ? (
        <>
          {allowed.includes("confirmed") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="confirmed" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnGreen}>
                Confirm visit
              </button>
            </form>
          ) : null}
          <form action={setPatientVisitStatus} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="en_route" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <label className="flex items-center gap-1 text-[10px] text-slate-600">
              SMS
              <select name="sendSms" className={selectCls} defaultValue="">
                <option value="">No</option>
                <option value="1">Send SMS</option>
              </select>
            </label>
            <button type="submit" className={btnPrimary}>
              En route
            </button>
          </form>
          {allowed.includes("missed") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="missed" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Missed
              </button>
            </form>
          ) : null}
          {allowed.includes("canceled") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="canceled" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Cancel
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {st === "confirmed" ? (
        <>
          <form action={setPatientVisitStatus} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="en_route" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <label className="flex items-center gap-1 text-[10px] text-slate-600">
              SMS
              <select name="sendSms" className={selectCls} defaultValue="">
                <option value="">No</option>
                <option value="1">Send SMS</option>
              </select>
            </label>
            <button type="submit" className={btnPrimary}>
              En route
            </button>
          </form>
          {allowed.includes("missed") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="missed" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Missed
              </button>
            </form>
          ) : null}
          {allowed.includes("canceled") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="canceled" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Cancel
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {st === "en_route" ? (
        <>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="arrived" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnGreen}>
              Arrived
            </button>
          </form>
          {allowed.includes("missed") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="missed" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Missed
              </button>
            </form>
          ) : null}
          {allowed.includes("canceled") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="canceled" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Cancel
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {st === "arrived" ? (
        <>
          <form action={setPatientVisitStatus}>
            <input type="hidden" name="visitId" value={visitId} />
            <input type="hidden" name="nextStatus" value="completed" />
            <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
            <button type="submit" className={btnGreen}>
              Completed
            </button>
          </form>
          {allowed.includes("canceled") ? (
            <form action={setPatientVisitStatus}>
              <input type="hidden" name="visitId" value={visitId} />
              <input type="hidden" name="nextStatus" value="canceled" />
              <input type="hidden" name="returnTo" value={RETURN_DISPATCH} />
              <button type="submit" className={btnMuted}>
                Cancel
              </button>
            </form>
          ) : null}
        </>
      ) : null}
      {(st === "completed" || st === "canceled" || st === "missed" || st === "rescheduled") && (
        <span className="text-[11px] text-slate-400">—</span>
      )}
    </div>
  );
}

export default async function DispatchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = searchParams ? await searchParams : {};
  const smsFlash = typeof sp.sms === "string" ? sp.sms : Array.isArray(sp.sms) ? sp.sms[0] : undefined;
  const smsErrRaw = typeof sp.smsErr === "string" ? sp.smsErr : Array.isArray(sp.smsErr) ? sp.smsErr[0] : undefined;
  const schedFlash = typeof sp.sched === "string" ? sp.sched : Array.isArray(sp.sched) ? sp.sched[0] : undefined;
  const reassFlash = typeof sp.reass === "string" ? sp.reass : Array.isArray(sp.reass) ? sp.reass[0] : undefined;
  const reschedFlash = typeof sp.resched === "string" ? sp.resched : Array.isArray(sp.resched) ? sp.resched[0] : undefined;

  const dateRaw = typeof sp.date === "string" ? sp.date : Array.isArray(sp.date) ? sp.date[0] : undefined;
  const statusFilter =
    typeof sp.status === "string" ? sp.status : Array.isArray(sp.status) ? sp.status[0] : "all";
  const clinicianFilter =
    typeof sp.clinician === "string" ? sp.clinician : Array.isArray(sp.clinician) ? sp.clinician[0] : "";
  const patientQ =
    typeof sp.q === "string" ? sp.q.trim().toLowerCase() : Array.isArray(sp.q) ? sp.q[0].trim().toLowerCase() : "";
  const defaultPatientId =
    typeof sp.patient === "string" ? sp.patient : Array.isArray(sp.patient) ? sp.patient[0] : undefined;

  const now = new Date();
  const selectedYmd =
    dateRaw && typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim())
      ? dateRaw.trim()
      : formatAppCalendarYmd(now);

  const dayStart = appCalendarMidnightUtc(selectedYmd);
  if (!dayStart) {
    redirect("/admin/crm/dispatch");
  }
  const nextYmd = addCalendarDaysToIsoDate(selectedYmd, 1);
  const dayEnd = appCalendarMidnightUtc(nextYmd);
  if (!dayEnd) {
    redirect("/admin/crm/dispatch");
  }
  const padLoYmd = addCalendarDaysToIsoDate(selectedYmd, -1);
  const padHiYmd = addCalendarDaysToIsoDate(selectedYmd, 2);
  const padLo = appCalendarMidnightUtc(padLoYmd);
  const padHi = appCalendarMidnightUtc(padHiYmd);
  if (!padLo || !padHi) {
    redirect("/admin/crm/dispatch");
  }
  const padLoIso = padLo.toISOString();
  const padHiIso = padHi.toISOString();
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  const selectVisits = `
    id,
    patient_id,
    assigned_user_id,
    scheduled_for,
    scheduled_end_at,
    time_window_label,
    status,
    created_at,
    visit_note,
    patient_phone_snapshot,
    address_snapshot,
    dispatch_patient_notified_at,
    dispatch_clinician_notified_at,
    notify_patient_on_schedule,
    notify_clinician_on_schedule,
    reminder_day_before_sent_at,
    reminder_day_of_sent_at,
    patients (
      id,
      contact_id,
      contacts ( full_name, first_name, last_name, primary_phone, address_line_1, address_line_2, city, state, zip )
    )
  `;

  const { data: timedRows, error: e1 } = await supabaseAdmin
    .from("patient_visits")
    .select(selectVisits)
    .gte("scheduled_for", padLoIso)
    .lt("scheduled_for", padHiIso);

  const { data: openNullRows, error: e2 } = await supabaseAdmin
    .from("patient_visits")
    .select(selectVisits)
    .is("scheduled_for", null)
    .in("status", ["scheduled", "confirmed", "en_route", "arrived"])
    .gte("created_at", dayStartIso)
    .lt("created_at", dayEndIso);

  const errMsg = e1?.message ?? e2?.message;
  const byId = new Map<string, VisitRow>();
  for (const r of (timedRows ?? []) as VisitRow[]) {
    byId.set(r.id, r);
  }
  for (const r of (openNullRows ?? []) as VisitRow[]) {
    byId.set(r.id, r);
  }

  let merged = [...byId.values()].filter((v) => {
    if (v.scheduled_for) {
      return visitOverlapsLocalDay(v.scheduled_for, v.scheduled_end_at, dayStart, dayEnd);
    }
    return true;
  });

  if (clinicianFilter) {
    merged = merged.filter((v) => (v.assigned_user_id ?? "") === clinicianFilter);
  }

  if (patientQ) {
    merged = merged.filter((v) => {
      const p = normalizePatientEmb(v.patients);
      const n = contactName(p?.contacts ?? null).toLowerCase();
      return n.includes(patientQ);
    });
  }

  if (statusFilter && statusFilter !== "all") {
    merged = merged.filter((v) => {
      if (statusFilter === "scheduled") return v.status === "scheduled";
      if (statusFilter === "confirmed") return v.status === "confirmed";
      return v.status === statusFilter;
    });
  }

  const assigneeIds = [...new Set(merged.map((v) => v.assigned_user_id).filter((x): x is string => Boolean(x)))];
  const emailByUserId: Record<string, string> = {};
  if (assigneeIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", assigneeIds);
    for (const p of profs ?? []) {
      const uid = p.user_id as string;
      const fn = (p.full_name as string | null)?.trim();
      const em = (p.email as string | null)?.trim();
      emailByUserId[uid] = fn || em || `${uid.slice(0, 8)}…`;
    }
  }

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name")
    .not("user_id", "is", null)
    .order("full_name", { ascending: true });

  const staffOptions = (staffRows ?? []).filter((r) => r.user_id) as {
    user_id: string;
    email: string | null;
    full_name: string | null;
  }[];

  const { data: patientPickRows } = await supabaseAdmin
    .from("patients")
    .select("id, contacts ( full_name, first_name, last_name )")
    .is("archived_at", null)
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(400);

  const patientOptions = (patientPickRows ?? []).map((raw) => {
    const id = String(raw.id);
    const cr = raw.contacts as ContactEmb | ContactEmb[] | null;
    const c = normalizeContact(cr);
    const label = contactName(c);
    return { id, label: label === "—" ? id.slice(0, 8) : label };
  });

  const staffForModal = staffOptions.map((s) => ({
    user_id: s.user_id,
    label: (s.full_name ?? "").trim() || s.email?.trim() || s.user_id.slice(0, 8),
  }));

  const nowMs = now.getTime();

  const dispatchStats = {
    scheduled: merged.filter((v) => v.status === "scheduled" && !needsAttentionVisit(v, nowMs)).length,
    confirmed: merged.filter((v) => v.status === "confirmed" && !needsAttentionVisit(v, nowMs)).length,
    en_route: merged.filter((v) => v.status === "en_route").length,
    needs_attention: merged.filter((v) => needsAttentionVisit(v, nowMs)).length,
  };

  const buckets: Record<BucketKey, VisitRow[]> = {
    scheduled: [],
    confirmed: [],
    en_route: [],
    arrived: [],
    completed: [],
    canceled: [],
    needs_attention: [],
  };

  for (const v of merged) {
    const b = primaryBucket(v, nowMs);
    buckets[b].push(v);
  }

  for (const k of BUCKET_ORDER) {
    buckets[k].sort((a, b) => {
      const ta = a.scheduled_for ? new Date(a.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.scheduled_for ? new Date(b.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  const dateInputValue = selectedYmd;

  return (
    <div className="space-y-6 bg-gradient-to-b from-slate-50/60 via-white to-slate-50/40 p-6">
      <AdminPageHeader
        eyebrow="Dispatch"
        title="Operations dispatch"
        description={
          <>
            Shared visit queue (admin + workspace phone). Filter by day, status, clinician, or patient name.
            {smsFlash === "sent" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                SMS sent.
              </span>
            ) : null}
            {smsFlash === "failed" ? (
              <span className="mt-3 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                SMS failed{smsErrRaw ? `: ${smsErrRaw}` : "."}
              </span>
            ) : null}
            {smsFlash === "skipped" ? (
              <span className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Visit marked en route (SMS not sent — choose “Send SMS” to text the patient).
              </span>
            ) : null}
            {smsFlash === "patient_ok" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Patient dispatch SMS sent.
              </span>
            ) : null}
            {smsFlash === "clinician_ok" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Clinician dispatch SMS sent.
              </span>
            ) : null}
            {smsFlash === "patient_fail" || smsFlash === "clinician_fail" ? (
              <span className="mt-3 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                SMS could not be sent.
              </span>
            ) : null}
            {smsFlash === "no_phone" ? (
              <span className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Add a dispatch SMS number for this clinician under Staff Access.
              </span>
            ) : null}
            {smsFlash === "no_clinician" ? (
              <span className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                Assign a clinician before texting them.
              </span>
            ) : null}
            {schedFlash === "ok" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Visit scheduled.
              </span>
            ) : null}
            {schedFlash === "dup" ? (
              <span className="mt-3 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                A visit already exists for this patient with the same time and assignment. Nothing new was created.
              </span>
            ) : null}
            {schedFlash && schedFlash !== "ok" && schedFlash !== "dup" ? (
              <span className="mt-3 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Could not schedule visit ({schedFlash}).
              </span>
            ) : null}
            {reassFlash === "ok" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Clinician updated.
              </span>
            ) : null}
            {reschedFlash === "ok" ? (
              <span className="mt-3 block rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Visit rescheduled.
              </span>
            ) : null}
            {errMsg ? <span className="mt-2 block text-sm text-red-700">{errMsg}</span> : null}
          </>
        }
      />

      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <ScheduleVisitModal patients={patientOptions} staff={staffForModal} defaultPatientId={defaultPatientId} />
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-700">
            Date
            <input
              name="date"
              type="date"
              defaultValue={dateInputValue}
              className="mt-1 block rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Status
            <select
              name="status"
              defaultValue={statusFilter}
              className="mt-1 block rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="en_route">En route</option>
              <option value="arrived">Arrived</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
              <option value="missed">Missed</option>
              <option value="rescheduled">Rescheduled</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Clinician
            <select
              name="clinician"
              defaultValue={clinicianFilter}
              className="mt-1 block max-w-[12rem] rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Any</option>
              {staffForModal.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Patient search
            <input
              name="q"
              type="search"
              defaultValue={patientQ}
              placeholder="Name contains…"
              className="mt-1 block w-44 rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-3 rounded-[20px] border border-slate-200/90 bg-white px-4 py-3 text-xs text-slate-700 shadow-sm">
        <span>
          <span className="font-semibold text-slate-900">{dispatchStats.scheduled}</span> scheduled
        </span>
        <span className="text-slate-300">·</span>
        <span>
          <span className="font-semibold text-violet-800">{dispatchStats.confirmed}</span> confirmed
        </span>
        <span className="text-slate-300">·</span>
        <span>
          <span className="font-semibold text-sky-800">{dispatchStats.en_route}</span> en route
        </span>
        <span className="text-slate-300">·</span>
        <span>
          <span className="font-semibold text-amber-800">{dispatchStats.needs_attention}</span> needs attention
        </span>
      </div>

      {BUCKET_ORDER.map((bucketKey) => {
        const rows = buckets[bucketKey] ?? [];
        return (
          <div key={bucketKey} className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">{BUCKET_LABELS[bucketKey]}</h2>
              <p className="text-xs text-slate-500">
                {rows.length} visit{rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="divide-y divide-slate-100 p-3 sm:p-4">
              {rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">None for this day / filters.</p>
              ) : (
                rows.map((v) => {
                  const p = normalizePatientEmb(v.patients);
                  const c = p?.contacts ?? null;
                  const phoneRaw = displayPhone(v, c);
                  const phoneDisp = phoneRaw ? formatPhoneForDisplay(phoneRaw) : "—";
                  const addr = displayAddress(v, c);
                  const nurse = v.assigned_user_id
                    ? emailByUserId[v.assigned_user_id] ?? v.assigned_user_id.slice(0, 8) + "…"
                    : "Unassigned";
                  const when = formatDispatchScheduleLine(
                    v.scheduled_for,
                    v.scheduled_end_at,
                    v.time_window_label
                  );
                  const tel = telHref(phoneRaw);
                  const maps = mapsHrefFromAddress(addr);

                  const notifyBits = [
                    v.dispatch_patient_notified_at ? "Patient SMS (dispatch)" : null,
                    v.dispatch_clinician_notified_at ? "Clinician SMS (dispatch)" : null,
                    v.reminder_day_of_sent_at ? "Reminder day-of" : null,
                    v.reminder_day_before_sent_at ? "Reminder day-before" : null,
                  ].filter(Boolean);

                  return (
                    <div key={v.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{contactName(c)}</div>
                          <div className="text-xs text-slate-600">{when}</div>
                          <div className="text-xs text-slate-500">{phoneDisp}</div>
                          {addr ? <div className="mt-1 text-xs text-slate-600">{addr}</div> : null}
                          <div className="mt-1 text-xs text-slate-700">
                            <span className="font-semibold">Clinician:</span> {nurse}
                          </div>
                          <div className="mt-1 text-xs capitalize text-slate-600">
                            Status:{" "}
                            <span
                              className={
                                v.status === "confirmed"
                                  ? "font-semibold text-violet-800"
                                  : v.status === "scheduled"
                                    ? "font-medium text-slate-800"
                                    : ""
                              }
                            >
                              {v.status.replace(/_/g, " ")}
                            </span>
                          </div>
                          {notifyBits.length > 0 ? (
                            <div className="mt-1 text-[10px] text-sky-800">{notifyBits.join(" · ")}</div>
                          ) : (
                            <div className="mt-1 text-[10px] text-slate-400">No dispatch/reminder SMS logged yet</div>
                          )}
                          {v.visit_note ? (
                            <div className="mt-1 text-[11px] text-slate-600">Note: {v.visit_note}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Link
                          href={`/admin/crm/patients/${v.patient_id}`}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-slate-50"
                        >
                          Open patient
                        </Link>
                        {tel ? (
                          <a href={tel} className={btnPrimary}>
                            Call patient
                          </a>
                        ) : (
                          <span className={`${btnMuted} cursor-not-allowed opacity-50`}>Call patient</span>
                        )}
                        <form action={sendDispatchVisitPatientSms} className="contents">
                          <input type="hidden" name="visitId" value={v.id} />
                          <button type="submit" className={btnPrimary}>
                            Text patient
                          </button>
                        </form>
                        <form action={sendDispatchVisitClinicianSms} className="contents">
                          <input type="hidden" name="visitId" value={v.id} />
                          <button type="submit" className={btnPrimary}>
                            Text clinician
                          </button>
                        </form>
                        {maps ? (
                          <a href={maps} target="_blank" rel="noreferrer" className={btnMuted}>
                            Open maps
                          </a>
                        ) : (
                          <span className={`${btnMuted} cursor-not-allowed opacity-50`}>Open maps</span>
                        )}
                        <CopyAddressButton address={addr} className={btnMuted} />
                      </div>

                      <div className="mt-2">
                        <VisitStatusActions visitId={v.id} status={v.status} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                        <form action={reassignDispatchVisit} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="visitId" value={v.id} />
                          <label className="text-[10px] font-semibold text-slate-600">
                            Reassign
                            <select
                              name="assignedUserId"
                              defaultValue={v.assigned_user_id ?? ""}
                              className="mt-0.5 block max-w-[10rem] rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                            >
                              <option value="">Unassigned</option>
                              {staffForModal.map((s) => (
                                <option key={s.user_id} value={s.user_id}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="submit" className={btnMuted}>
                            Save
                          </button>
                        </form>
                        <form action={rescheduleDispatchVisit} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="visitId" value={v.id} />
                          <label className="text-[10px] font-semibold text-slate-600">
                            Reschedule date
                            <input
                              name="visitDate"
                              type="date"
                              required
                              className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-[11px]"
                            />
                          </label>
                          <label className="text-[10px] font-semibold text-slate-600">
                            Time
                            <select
                              name="visitTime"
                              required
                              defaultValue="09:00"
                              className="mt-0.5 block max-w-[7.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-[11px]"
                            >
                              {RESCHEDULE_TIME_SLOTS.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button type="submit" className={btnMuted}>
                            Reschedule
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
