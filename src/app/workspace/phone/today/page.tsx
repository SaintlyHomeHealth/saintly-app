import { redirect } from "next/navigation";
import Link from "next/link";
import { BellRing, CalendarClock, Inbox, PhoneMissed } from "lucide-react";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { WorkspacePhoneQuickActions } from "../_components/WorkspacePhoneQuickActions";
import { TodayVisitCard } from "./TodayVisitCard";
import { allowedNextVisitStatuses, formatVisitStatusLabel } from "@/lib/crm/patient-visit-status";
import { visitNeedsAttentionOperational } from "@/lib/crm/dispatch-needs-attention";
import { formatDispatchScheduleLine } from "@/lib/crm/dispatch-visit";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile, hasFullCallVisibility } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type VisitRow = {
  id: string;
  patient_id: string;
  assigned_user_id: string | null;
  scheduled_for: string | null;
  scheduled_end_at: string | null;
  time_window_label: string | null;
  status: string;
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
};

function displayName(c: ContactRow): string {
  const full = (c.full_name ?? "").trim();
  if (full) return full;
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Patient";
}

function addressLine(c: ContactRow): string | null {
  const line1 = (c.address_line_1 ?? "").trim();
  const line2 = (c.address_line_2 ?? "").trim();
  const city = (c.city ?? "").trim();
  const state = (c.state ?? "").trim();
  const zip = (c.zip ?? "").trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const out = [line1, line2, cityLine].filter(Boolean).join(", ");
  return out || null;
}

function reminderLabel(raw: string | null): string {
  if (raw === "caregiver") return "Reminder: caregiver";
  if (raw === "both") return "Reminder: both";
  return "Reminder: patient";
}

function reminderStateLabel(v: VisitRow): string {
  if (v.reminder_day_of_sent_at) return "Day-of sent";
  if (v.reminder_day_before_sent_at) return "Day-before sent";
  return "Not sent";
}

type VisitItem = VisitRow & {
  contact: ContactRow;
  patientName: string;
  mapsHref: string | null;
  inboxHref: string | null;
  whenTs: number;
  whenLabel: string;
};

function formatOnSiteDuration(arrivedAt: string | null, completedAt: string | null): string | null {
  if (!arrivedAt || !completedAt) return null;
  const a = new Date(arrivedAt).getTime();
  const b = new Date(completedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const mins = Math.round((b - a) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default async function WorkspaceTodayPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const uid = staff.user_id;

  const [{ data: asnRows, error: asnErr }, { data: visitAssigneeRows }] = await Promise.all([
    supabaseAdmin
      .from("patient_assignments")
      .select("patient_id")
      .eq("assigned_user_id", uid)
      .eq("is_active", true),
    supabaseAdmin
      .from("patient_visits")
      .select("patient_id")
      .eq("assigned_user_id", uid)
      .in("status", ["scheduled", "confirmed", "en_route", "arrived", "missed", "rescheduled"])
      .limit(500),
  ]);

  const patientIdSet = new Set<string>();
  for (const r of asnRows ?? []) {
    const id = String((r as { patient_id?: string }).patient_id ?? "").trim();
    if (id) patientIdSet.add(id);
  }
  for (const r of visitAssigneeRows ?? []) {
    const id = String((r as { patient_id?: string }).patient_id ?? "").trim();
    if (id) patientIdSet.add(id);
  }

  const patientIds = [...patientIdSet];

  const patientsById = new Map<string, { id: string; contact_id: string; contact: ContactRow | null }>();
  if (patientIds.length > 0) {
    const { data: pRows } = await supabaseAdmin
      .from("patients")
      .select(
        "id, contact_id, contacts ( id, full_name, first_name, last_name, primary_phone, address_line_1, address_line_2, city, state, zip )"
      )
      .in("id", patientIds);
    for (const raw of pRows ?? []) {
      const id = String(raw.id);
      const contactId = typeof raw.contact_id === "string" ? raw.contact_id : "";
      const cRaw = (raw as { contacts?: unknown }).contacts;
      const c =
        cRaw && typeof cRaw === "object" && !Array.isArray(cRaw)
          ? (cRaw as ContactRow)
          : Array.isArray(cRaw) && cRaw[0]
            ? (cRaw[0] as ContactRow)
            : null;
      patientsById.set(id, { id, contact_id: contactId, contact: c });
    }
  }

  const contactIds = [...new Set([...patientsById.values()].map((p) => p.contact_id).filter(Boolean))];
  const threadByContactId = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: convRows } = await supabaseAdmin
      .from("conversations")
      .select("id, primary_contact_id, last_message_at")
      .eq("channel", "sms")
      .in("primary_contact_id", contactIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    for (const r of convRows ?? []) {
      const cid = typeof r.primary_contact_id === "string" ? r.primary_contact_id : "";
      if (!cid || threadByContactId.has(cid)) continue;
      threadByContactId.set(cid, String(r.id));
    }
  }

  let visits: VisitItem[] = [];
  if (patientIds.length > 0) {
    const { data: vRows } = await supabaseAdmin
      .from("patient_visits")
      .select(
        "id, patient_id, assigned_user_id, scheduled_for, scheduled_end_at, time_window_label, status, reminder_recipient, reminder_day_before_sent_at, reminder_day_of_sent_at, en_route_at, arrived_at, completed_at, arrived_lat, arrived_lng, completed_lat, completed_lng"
      )
      .in("patient_id", patientIds)
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .limit(200);
    visits = (vRows ?? [])
      .map((v) => {
        const pid = String(v.patient_id);
        const p = patientsById.get(pid);
        if (!p || !p.contact) return null;
        const whenRaw = typeof v.scheduled_for === "string" ? v.scheduled_for : "";
        const whenTs = whenRaw ? new Date(whenRaw).getTime() : 0;
        const addr = addressLine(p.contact);
        const mapsHref = addr
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
          : null;
        const inboxId = p.contact_id ? threadByContactId.get(p.contact_id) ?? null : null;
        return {
          id: String(v.id),
          patient_id: pid,
          assigned_user_id: typeof v.assigned_user_id === "string" ? v.assigned_user_id : null,
          scheduled_for: whenRaw || null,
          scheduled_end_at: typeof v.scheduled_end_at === "string" ? v.scheduled_end_at : null,
          time_window_label: typeof v.time_window_label === "string" ? v.time_window_label : null,
          status: String(v.status ?? ""),
          reminder_recipient: typeof v.reminder_recipient === "string" ? v.reminder_recipient : null,
          reminder_day_before_sent_at:
            typeof v.reminder_day_before_sent_at === "string" ? v.reminder_day_before_sent_at : null,
          reminder_day_of_sent_at:
            typeof v.reminder_day_of_sent_at === "string" ? v.reminder_day_of_sent_at : null,
          en_route_at: typeof v.en_route_at === "string" ? v.en_route_at : null,
          arrived_at: typeof v.arrived_at === "string" ? v.arrived_at : null,
          completed_at: typeof v.completed_at === "string" ? v.completed_at : null,
          arrived_lat: typeof v.arrived_lat === "number" ? v.arrived_lat : null,
          arrived_lng: typeof v.arrived_lng === "number" ? v.arrived_lng : null,
          completed_lat: typeof v.completed_lat === "number" ? v.completed_lat : null,
          completed_lng: typeof v.completed_lng === "number" ? v.completed_lng : null,
          contact: p.contact,
          patientName: displayName(p.contact),
          mapsHref,
          inboxHref: inboxId ? `/workspace/phone/inbox/${inboxId}` : null,
          whenTs: Number.isFinite(whenTs) ? whenTs : 0,
          whenLabel: whenRaw
            ? formatDispatchScheduleLine(
                whenRaw,
                typeof v.scheduled_end_at === "string" ? v.scheduled_end_at : null,
                typeof v.time_window_label === "string" ? v.time_window_label : null
              )
            : "Unscheduled",
        } satisfies VisitItem;
      })
      .filter((x): x is VisitItem => Boolean(x));
  }

  const now = new Date();
  const nowMs = now.getTime();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

  const activeStatuses = new Set(["scheduled", "confirmed", "en_route", "arrived"]);

  const today = visits.filter((v) => {
    if (!activeStatuses.has(v.status)) return false;
    if (visitNeedsAttentionOperational(v, nowMs)) return false;
    return v.whenTs >= dayStart && v.whenTs < dayEnd;
  });

  const upcoming = visits.filter((v) => {
    if (!activeStatuses.has(v.status)) return false;
    if (visitNeedsAttentionOperational(v, nowMs)) return false;
    return v.whenTs >= dayEnd;
  });

  const needsAttention = visits.filter((v) => visitNeedsAttentionOperational(v, nowMs));

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let missedCallsQ = supabase
    .from("phone_calls")
    .select("id", { count: "exact", head: true })
    .eq("status", "missed");
  let convoCountQ = supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("channel", "sms");
  if (!hasFull) {
    const scope = `assigned_to_user_id.eq.${uid},assigned_to_user_id.is.null`;
    missedCallsQ = missedCallsQ.or(scope);
    convoCountQ = convoCountQ.or(scope);
  }
  const [{ count: missedCallsCount }, { count: inboxCount }] = await Promise.all([missedCallsQ, convoCountQ]);

  const nextVisit =
    visits
      .filter((v) => activeStatuses.has(v.status))
      .sort((a, b) => a.whenTs - b.whenTs)
      .find((v) => v.whenTs >= nowMs) ?? today[0] ?? upcoming[0] ?? needsAttention[0] ?? null;

  const renderSection = (
    title: string,
    subtitle: string,
    items: VisitItem[],
    emptyCta: { href: string; label: string }
  ) => (
    <section>
      <div className="mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
          <BellRing className="mx-auto h-5 w-5 text-slate-400" strokeWidth={2} />
          <p className="mt-2 text-sm text-slate-500">Nothing to work here right now.</p>
          <Link
            href={emptyCta.href}
            className="mt-3 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {emptyCta.label}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((v) => {
            const allowed = allowedNextVisitStatuses(v.status);
            return (
              <TodayVisitCard
                key={v.id}
                visitId={v.id}
                patientId={v.patient_id}
                patientName={v.patientName}
                patientPhone={v.contact.primary_phone}
                addressLine={addressLine(v.contact)}
                whenLabel={v.whenLabel}
                statusKey={v.status}
                statusLabel={formatVisitStatusLabel(v.status)}
                reminderLabel={reminderLabel(v.reminder_recipient)}
                reminderStateLabel={reminderStateLabel(v)}
                enRouteAtLabel={v.en_route_at ? formatAdminPhoneWhen(v.en_route_at) : null}
                arrivedAtLabel={v.arrived_at ? formatAdminPhoneWhen(v.arrived_at) : null}
                completedAtLabel={v.completed_at ? formatAdminPhoneWhen(v.completed_at) : null}
                onSiteDurationLabel={formatOnSiteDuration(v.arrived_at, v.completed_at)}
                locationCapturedLabel={
                  v.completed_lat != null && v.completed_lng != null
                    ? "Location: completion"
                    : v.arrived_lat != null && v.arrived_lng != null
                      ? "Location: arrival"
                      : null
                }
                mapsHref={v.mapsHref}
                inboxHref={v.inboxHref}
                canConfirm={allowed.includes("confirmed")}
                canEnRoute={allowed.includes("en_route")}
                canArrived={allowed.includes("arrived")}
                canComplete={allowed.includes("completed")}
                canMissed={allowed.includes("missed")}
                canReschedule={v.status !== "completed" && v.status !== "canceled"}
              />
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div className="px-4 pb-8 pt-5 sm:px-5 lg:mx-auto lg:max-w-4xl lg:px-6">
      <WorkspacePhonePageHeader
        title="Today"
        subtitle="Your next visits and anything that needs a decision before you go."
      />
      <div className="mt-2">
        <WorkspacePhoneQuickActions />
      </div>
      <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/45">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Next up</p>
        {nextVisit ? (
          <div className="mt-2">
            <p className="truncate text-base font-semibold text-slate-900">{nextVisit.patientName}</p>
            <p className="mt-0.5 text-sm text-slate-600">{nextVisit.whenLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/workspace/phone/patients/${nextVisit.patient_id}`}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Open patient
              </Link>
              {nextVisit.inboxHref ? (
                <Link
                  href={nextVisit.inboxHref}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open thread
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No upcoming visits yet.</p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
              <CalendarClock className="h-3.5 w-3.5" /> Visits today
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{today.length}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
              <Inbox className="h-3.5 w-3.5" /> Inbox threads
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{inboxCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-rose-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-700">
              <PhoneMissed className="h-3.5 w-3.5" /> Missed calls
            </p>
            <p className="mt-1 text-lg font-semibold text-rose-900">{missedCallsCount ?? 0}</p>
          </div>
        </div>
      </section>
      {asnErr ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Could not load assignments.
        </p>
      ) : null}

      <div className="mt-8 space-y-10">
        {renderSection(
          "Needs attention",
          "Overdue, due soon, missed, rescheduled, or missing schedule — handle these first.",
          needsAttention,
          { href: "/workspace/phone/calls", label: "Open calls" }
        )}
        {renderSection("On track today", "Visits scheduled for today that are in good shape.", today, {
          href: "/workspace/phone/patients",
          label: "Open patients",
        })}
        {renderSection("Coming up", "Later visits on your calendar.", upcoming, {
          href: "/workspace/phone/inbox",
          label: "Open inbox",
        })}
      </div>
    </div>
  );
}
