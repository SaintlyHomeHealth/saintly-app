import Link from "next/link";
import { redirect } from "next/navigation";

import { SoftphoneDialer } from "@/components/softphone/SoftphoneDialer";
import { supabaseAdmin } from "@/lib/admin";
import {
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { RecentCallsLive } from "../recent-calls-live";
import type {
  ContactPipelineState,
  PhoneCallRow,
  PhoneCallTaskSnippet,
  PhoneNotificationRow,
} from "../recent-calls-live";
import { parsePhoneCallsSearchParams, type PhoneCallsFilters } from "../phone-call-filters";

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactNameEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactNameEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactNameEmbed;
  }

  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

async function loadContactPipelineByContactId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  contactIds: string[]
): Promise<Record<string, ContactPipelineState>> {
  const out: Record<string, ContactPipelineState> = {};
  if (contactIds.length === 0) return out;
  for (const id of contactIds) {
    out[id] = { activeLeadId: null, patientStatus: null };
  }

  const { data: patientRows } = await supabase
    .from("patients")
    .select("contact_id, patient_status")
    .in("contact_id", contactIds);

  for (const p of patientRows ?? []) {
    const cid = typeof p.contact_id === "string" ? p.contact_id : null;
    if (!cid || !out[cid]) continue;
    const ps = typeof p.patient_status === "string" ? p.patient_status : "pending";
    out[cid] = { activeLeadId: null, patientStatus: ps };
  }

  const { data: leadRows, error: leadsErr } = await supabase
    .from("leads")
    .select("id, contact_id, status, created_at")
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false });

  if (leadsErr) {
    console.warn("[admin/phone/calls] leads for contact pipeline:", leadsErr.message);
  }

  for (const L of leadRows ?? []) {
    const cid = typeof L.contact_id === "string" ? L.contact_id : null;
    if (!cid || !out[cid]) continue;
    if (out[cid].patientStatus) continue;

    const st = typeof L.status === "string" ? L.status.trim() : "";
    if (st === "converted") continue;
    if (!out[cid].activeLeadId) {
      out[cid] = { ...out[cid], activeLeadId: String(L.id) };
    }
  }

  return out;
}

function mapMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

function mapPhoneCallQueryRow(raw: Record<string, unknown>): PhoneCallRow {
  const crm_contact_display_name = crmDisplayNameFromContactsRaw((raw as { contacts?: unknown }).contacts);

  return {
    id: String(raw.id),
    created_at: String(raw.created_at),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : String(raw.created_at),
    external_call_id: String(raw.external_call_id),
    direction: String(raw.direction),
    from_e164: typeof raw.from_e164 === "string" ? raw.from_e164 : null,
    to_e164: typeof raw.to_e164 === "string" ? raw.to_e164 : null,
    status: String(raw.status),
    started_at: typeof raw.started_at === "string" ? raw.started_at : null,
    ended_at: typeof raw.ended_at === "string" ? raw.ended_at : null,
    duration_seconds: (() => {
      const d = raw.duration_seconds;
      if (typeof d === "number" && Number.isFinite(d)) return Math.round(d);
      if (typeof d === "string" && d.trim() !== "") {
        const n = Number.parseInt(d, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })(),
    voicemail_recording_sid:
      typeof raw.voicemail_recording_sid === "string" ? raw.voicemail_recording_sid : null,
    voicemail_duration_seconds: (() => {
      const d = raw.voicemail_duration_seconds;
      if (typeof d === "number" && Number.isFinite(d)) return Math.round(d);
      if (typeof d === "string" && d.trim() !== "") {
        const n = Number.parseInt(d, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })(),
    priority_sms_sent_at: typeof raw.priority_sms_sent_at === "string" ? raw.priority_sms_sent_at : null,
    priority_sms_reason: typeof raw.priority_sms_reason === "string" ? raw.priority_sms_reason : null,
    auto_reply_sms_sent_at: typeof raw.auto_reply_sms_sent_at === "string" ? raw.auto_reply_sms_sent_at : null,
    auto_reply_sms_body: typeof raw.auto_reply_sms_body === "string" ? raw.auto_reply_sms_body : null,
    assigned_to_user_id: typeof raw.assigned_to_user_id === "string" ? raw.assigned_to_user_id : null,
    assigned_at: typeof raw.assigned_at === "string" ? raw.assigned_at : null,
    assigned_to_label: typeof raw.assigned_to_label === "string" ? raw.assigned_to_label : null,
    primary_tag: typeof raw.primary_tag === "string" ? raw.primary_tag : null,
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : null,
    crm_contact_display_name,
    metadata: mapMetadata(raw.metadata),
  };
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPhoneCallsFullPage({ searchParams }: PageProps) {
  const staffProfile = await getStaffProfile();
  if (!staffProfile || !isPhoneWorkspaceUser(staffProfile)) redirect("/admin");

  const hasFull = hasFullCallVisibility(staffProfile);
  const sp = (await searchParams) ?? {};
  const filters: PhoneCallsFilters = parsePhoneCallsSearchParams(sp);

  const supabase = await createServerSupabaseClient();

  // Used to keep the main filters behavior consistent for the task-based query.
  let callIdsWithOpenTasks: string[] | null = null;
  if (filters.tasks === "has_open_tasks" || filters.tasks === "no_open_tasks") {
    const { data: taskIdRows } = await supabase
      .from("phone_call_tasks")
      .select("phone_call_id")
      .in("status", ["open", "in_progress"]);

    callIdsWithOpenTasks = [
      ...new Set((taskIdRows ?? []).map((r) => String((r as { phone_call_id: string }).phone_call_id))),
    ];
  }

  const shortCircuitEmptyTasks =
    filters.tasks === "has_open_tasks" && (!callIdsWithOpenTasks || callIdsWithOpenTasks.length === 0);

  let rows: unknown[] | null = null;
  let error: { message: string } | null = null;

  if (shortCircuitEmptyTasks) {
    rows = [];
  } else {
    let q = supabase
      .from("phone_calls")
      .select(
        "id, created_at, updated_at, external_call_id, direction, from_e164, to_e164, status, started_at, ended_at, duration_seconds, voicemail_recording_sid, voicemail_duration_seconds, priority_sms_sent_at, priority_sms_reason, auto_reply_sms_sent_at, auto_reply_sms_body, assigned_to_user_id, assigned_at, assigned_to_label, primary_tag, contact_id, metadata, contacts ( full_name, first_name, last_name )"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (!hasFull) {
      q = q.or(`assigned_to_user_id.eq.${staffProfile.user_id},assigned_to_user_id.is.null`);
    }

    if (filters.assigned === "me") q = q.eq("assigned_to_user_id", staffProfile.user_id);
    else if (filters.assigned === "unassigned") q = q.is("assigned_to_user_id", null);

    if (filters.status !== "all") q = q.eq("status", filters.status);

    if (filters.tag === "untagged") q = q.is("primary_tag", null);
    else if (filters.tag !== "all") q = q.eq("primary_tag", filters.tag);

    if (filters.tasks === "has_open_tasks" && callIdsWithOpenTasks && callIdsWithOpenTasks.length > 0) {
      q = q.in("id", callIdsWithOpenTasks);
    } else if (filters.tasks === "no_open_tasks" && callIdsWithOpenTasks && callIdsWithOpenTasks.length > 0) {
      q = q.not("id", "in", `(${callIdsWithOpenTasks.join(",")})`);
    }

    const res = await q;
    rows = res.data;
    error = res.error;
  }

  const calls = (rows || []).map((r) => mapPhoneCallQueryRow(r as Record<string, unknown>));

  const contactIdsForPipeline = [...new Set(calls.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];
  const contactPipelineByContactId = await loadContactPipelineByContactId(supabase, contactIdsForPipeline);

  const callIds = calls.map((c) => c.id);

  let newFollowUpCount = 0;
  if (hasFull) {
    const { count } = await supabase
      .from("phone_call_notifications")
      .select("*", { count: "exact", head: true })
      .eq("status", "new");
    newFollowUpCount = count ?? 0;
  }

  const notifByCallId: Record<string, PhoneNotificationRow[]> = {};
  if (callIds.length > 0 && hasFull) {
    const { data: notifRows } = await supabase
      .from("phone_call_notifications")
      .select("id, phone_call_id, type, status, created_at, acknowledged_at, last_sms_attempt_at, last_sms_error")
      .in("phone_call_id", callIds)
      .order("created_at", { ascending: true });

    for (const n of (notifRows || []) as PhoneNotificationRow[]) {
      const list = notifByCallId[n.phone_call_id] ?? [];
      list.push(n);
      notifByCallId[n.phone_call_id] = list;
    }
  }

  const taskCountByCallId: Record<string, number> = {};
  const taskSnippetsByCallId: Record<string, PhoneCallTaskSnippet[]> = {};
  if (callIds.length > 0) {
    const { data: taskRows, error: taskErr } = await supabase
      .from("phone_call_tasks")
      .select("id, phone_call_id, title, status, created_at")
      .in("phone_call_id", callIds)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });

    if (taskErr) {
      console.warn("[admin/phone/calls] phone_call_tasks:", taskErr.message);
    } else {
      const grouped = new Map<
        string,
        { id: string; phone_call_id: string; title: string; status: string; created_at: string }[]
      >();

      for (const t of taskRows ?? []) {
        const row = t as {
          id: string;
          phone_call_id: string;
          title: string;
          status: string;
          created_at: string;
        };
        taskCountByCallId[row.phone_call_id] = (taskCountByCallId[row.phone_call_id] ?? 0) + 1;
        const list = grouped.get(row.phone_call_id) ?? [];
        list.push(row);
        grouped.set(row.phone_call_id, list);
      }

      for (const [pid, list] of grouped) {
        const sorted = list
          .slice()
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        taskSnippetsByCallId[pid] = sorted.slice(0, 2).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
        }));
      }
    }
  }

  const { count: myActiveTaskCount } = await supabase
    .from("phone_call_tasks")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to_user_id", staffProfile.user_id)
    .in("status", ["open", "in_progress"]);

  let assignableStaff: { user_id: string; label: string }[] = [];
  if (hasFull) {
    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .not("user_id", "is", null)
      .eq("is_active", true)
      .order("email", { ascending: true });

    if (staffErr) {
      console.warn("[admin/phone/calls] assignable staff:", staffErr.message);
    } else {
      assignableStaff = (staffRows ?? [])
        .map((r) => {
          const uid = typeof r.user_id === "string" ? r.user_id : "";
          if (!uid) return null;
          const em = typeof r.email === "string" ? r.email.trim() : "";
          const fn = typeof r.full_name === "string" ? r.full_name.trim() : "";
          const label = em || fn || `User ${uid.slice(0, 8)}…`;
          return { user_id: uid, label };
        })
        .filter((x): x is { user_id: string; label: string } => Boolean(x));
    }
  }

  const staffDisplayName =
    staffProfile.email?.trim() ||
    `${staffProfile.role.replace(/_/g, " ")} (${staffProfile.user_id.slice(0, 8)}…)`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Twilio Programmable Voice</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Phone Calls</h1>
            {(newFollowUpCount ?? 0) > 0 ? (
              <span
                className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-950"
                title="Open follow-ups (missed call or voicemail)"
              >
                {newFollowUpCount} follow-up{newFollowUpCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Recent inbound calls and Saintly voicemail flags. Inbound webhook: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/twilio/voice</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/admin/phone"
            className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to phone page
          </Link>
          <Link
            href="/admin/phone/tasks"
            className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100"
          >
            My Tasks
            {(myActiveTaskCount ?? 0) > 0 ? ` (${myActiveTaskCount})` : ""}
          </Link>
        </div>
      </div>

      <SoftphoneDialer staffDisplayName={staffDisplayName} />

      <form
        method="get"
        action="/admin/phone/calls"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs"
      >
        <label className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-600">Assigned</span>
          <select
            name="assigned"
            defaultValue={filters.assigned}
            className="min-w-[7.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-slate-800"
          >
            <option value="all">All</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-600">Status</span>
          <select
            name="status"
            defaultValue={filters.status}
            className="min-w-[7.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-slate-800"
          >
            <option value="all">All</option>
            <option value="missed">Missed</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-600">Tag</span>
          <select
            name="tag"
            defaultValue={filters.tag}
            className="min-w-[7.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-slate-800"
          >
            <option value="all">All</option>
            <option value="untagged">Untagged</option>
            <option value="patient">patient</option>
            <option value="referral">referral</option>
            <option value="caregiver">caregiver</option>
            <option value="family">family</option>
            <option value="vendor">vendor</option>
            <option value="spam">spam</option>
            <option value="other">other</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-600">Tasks</span>
          <select
            name="tasks"
            defaultValue={filters.tasks}
            className="min-w-[9rem] rounded border border-slate-200 bg-white px-2 py-1 text-slate-800"
          >
            <option value="all">All</option>
            <option value="has_open_tasks">Has open tasks</option>
            <option value="no_open_tasks">No open tasks</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Apply
        </button>
        <Link
          href="/admin/phone/calls"
          className="rounded-md border border-transparent px-2 py-1.5 text-xs font-semibold text-sky-800 underline"
        >
          Clear
        </Link>
      </form>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load phone_calls: {error.message}
        </div>
      ) : null}

      {!error ? (
        <RecentCallsLive
          initialCalls={calls}
          initialNotifByCallId={notifByCallId}
          initialContactPipeline={contactPipelineByContactId}
          taskCountByCallId={taskCountByCallId}
          taskSnippetsByCallId={taskSnippetsByCallId}
          allowUnassign={isAdminOrHigher(staffProfile)}
          callVisibility={hasFull ? "full" : "nurse"}
          currentUserId={staffProfile.user_id}
          assignableStaff={assignableStaff}
          maxVisible={100}
        />
      ) : null}
    </div>
  );
}

