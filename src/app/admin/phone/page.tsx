import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatTimeAgo } from "@/lib/phone/format-time-ago";
import {
  getStaffProfile,
  hasFullCallVisibility,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

import {
  callerPartyE164,
  formatCallLogOutcome,
  formatCallLogStatus,
  mapPhoneCallQueryRowForLog,
} from "./call-log-display";
import { CallLogCreateLeadButton } from "./_components/CallLogCreateLeadButton";
import {
  formatVoiceAiCallerCategoryLabel,
  readVoiceAiMetadataFromMetadata,
} from "./_lib/voice-ai-metadata";
import {
  getCallUrgency,
  getFollowUpStatus,
  sortCallsForOperationalView,
} from "./call-log-command-center";
import { callLogSearchParamsToQuery, parseCallLogSearchParams } from "./call-log-params";

type ContactOpenTarget = {
  patientId: string | null;
  activeLeadId: string | null;
};

async function loadContactOpenTargets(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  contactIds: string[]
): Promise<Record<string, ContactOpenTarget>> {
  const out: Record<string, ContactOpenTarget> = {};
  if (contactIds.length === 0) return out;
  for (const id of contactIds) {
    out[id] = { patientId: null, activeLeadId: null };
  }

  const { data: patientRows } = await supabase
    .from("patients")
    .select("id, contact_id")
    .in("contact_id", contactIds);

  for (const p of patientRows ?? []) {
    const cid = typeof p.contact_id === "string" ? p.contact_id : null;
    const pid = typeof p.id === "string" ? p.id : null;
    if (!cid || !out[cid]) continue;
    out[cid] = { patientId: pid, activeLeadId: null };
  }

  const { data: leadRows, error: leadsErr } = await supabase
    .from("leads")
    .select("id, contact_id, status, created_at")
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false });

  if (leadsErr) {
    console.warn("[admin/phone call log] leads:", leadsErr.message);
  }

  for (const L of leadRows ?? []) {
    const cid = typeof L.contact_id === "string" ? L.contact_id : null;
    if (!cid || !out[cid]) continue;
    if (out[cid].patientId) continue;
    const st = typeof L.status === "string" ? L.status.trim() : "";
    if (st === "converted") continue;
    if (!out[cid].activeLeadId) {
      out[cid] = { ...out[cid], activeLeadId: String(L.id) };
    }
  }

  return out;
}

function formatCallType(direction: string): string {
  const d = direction.trim().toLowerCase();
  if (d === "inbound") return "Inbound";
  if (d === "outbound") return "Outbound";
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : "—";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPhoneCallLogPage({ searchParams }: PageProps) {
  const staffProfile = await getStaffProfile();
  if (!staffProfile || !isPhoneWorkspaceUser(staffProfile)) {
    redirect("/admin");
  }

  const hasFull = hasFullCallVisibility(staffProfile);
  const sp = (await searchParams) ?? {};
  let q = parseCallLogSearchParams(sp);

  if (q.from && q.to && q.from > q.to) {
    const t = q.from;
    q = { ...q, from: q.to, to: t };
  }

  const supabase = await createServerSupabaseClient();

  let dbQuery = supabase
    .from("phone_calls")
    .select(
      "id, created_at, updated_at, external_call_id, direction, from_e164, to_e164, status, started_at, ended_at, duration_seconds, voicemail_recording_sid, voicemail_duration_seconds, priority_sms_sent_at, priority_sms_reason, auto_reply_sms_sent_at, auto_reply_sms_body, assigned_to_user_id, assigned_at, assigned_to_label, primary_tag, contact_id, metadata, contacts ( full_name, first_name, last_name )"
    )
    .order("created_at", { ascending: false })
    .limit(q.limit);

  if (!hasFull) {
    dbQuery = dbQuery.or(
      `assigned_to_user_id.eq.${staffProfile.user_id},assigned_to_user_id.is.null`
    );
  }

  if (q.view === "missed") {
    dbQuery = dbQuery.eq("status", "missed");
  }

  if (q.assigned === "me") {
    dbQuery = dbQuery.eq("assigned_to_user_id", staffProfile.user_id);
  }

  if (q.from) {
    dbQuery = dbQuery.gte("created_at", `${q.from}T00:00:00.000Z`);
  }
  if (q.to) {
    dbQuery = dbQuery.lte("created_at", `${q.to}T23:59:59.999Z`);
  }

  const { data: rows, error } = await dbQuery;
  const calls = (rows ?? []).map((r) => mapPhoneCallQueryRowForLog(r as Record<string, unknown>));
  const sortedCalls = sortCallsForOperationalView(calls);

  const contactIds = [...new Set(calls.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];
  const openByContactId = await loadContactOpenTargets(supabase, contactIds);

  const assigneeIds = [
    ...new Set(calls.map((c) => c.assigned_to_user_id).filter((x): x is string => Boolean(x))),
  ];
  const staffLabelByUserId = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", assigneeIds);
    if (staffErr) {
      console.warn("[admin/phone call log] staff_profiles:", staffErr.message);
    } else {
      for (const r of staffRows ?? []) {
        const uid = typeof r.user_id === "string" ? r.user_id : "";
        if (!uid) continue;
        const em = typeof r.email === "string" ? r.email.trim() : "";
        const fn = typeof r.full_name === "string" ? r.full_name.trim() : "";
        staffLabelByUserId.set(uid, em || fn || `User ${uid.slice(0, 8)}…`);
      }
    }
  }

  const { count: myActiveTaskCount } = await supabase
    .from("phone_call_tasks")
    .select("*", { count: "exact", head: true })
    .eq("assigned_to_user_id", staffProfile.user_id)
    .in("status", ["open", "in_progress"]);

  const baseQuery = callLogSearchParamsToQuery(q);
  const linkWith = (patch: Partial<typeof q>) => {
    const next = { ...q, ...patch };
    return `/admin/phone?${callLogSearchParamsToQuery(next).toString()}`;
  };

  const canDial = Boolean(staffProfile.phone_access_enabled);

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-4 pb-10 pt-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm">
        <AdminPageHeader
          eyebrow="Voice"
          title="Call Log"
          description={
            <>
              Organization call history and missed-call recovery. Place calls and SMS from the{" "}
              <Link href="/workspace/phone/keypad" className="font-semibold text-sky-800 underline">
                workspace keypad
              </Link>
              ; manage leads and patients from <span className="font-semibold text-slate-800">Contacts</span> and{" "}
              <span className="font-semibold text-slate-800">Patients</span> in the top bar.
            </>
          }
          actions={
            <>
              {staffProfile.phone_access_enabled ? (
                <Link
                  href="/admin/phone/messages"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                >
                  SMS Inbox
                </Link>
              ) : null}
              {staffProfile.phone_access_enabled ? (
                <Link
                  href="/workspace/phone/keypad"
                  className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100"
                >
                  Workspace keypad
                </Link>
              ) : null}
              <Link
                href="/admin/phone/tasks"
                className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100"
              >
                My Tasks
                {(myActiveTaskCount ?? 0) > 0 ? ` (${myActiveTaskCount})` : ""}
              </Link>
              <Link
                href="/admin/phone/dashboard"
                className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-100"
              >
                Command Dashboard
              </Link>
            </>
          }
        />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <form method="get" action="/admin/phone" className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          {q.view === "missed" ? <input type="hidden" name="view" value="missed" /> : null}
          {q.assigned === "me" ? <input type="hidden" name="assigned" value="me" /> : null}

          <div className="flex flex-wrap gap-2">
            <Link
              href={linkWith({ view: "all" })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                q.view === "all"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              All calls
            </Link>
            <Link
              href={linkWith({ view: "missed" })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                q.view === "missed"
                  ? "bg-rose-700 text-white"
                  : "border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100"
              }`}
            >
              Missed only
            </Link>
            <Link
              href={linkWith({ assigned: "all" })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                q.assigned === "all"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              All assignees
            </Link>
            <Link
              href={linkWith({ assigned: "me" })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                q.assigned === "me"
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
            >
              Assigned to me
            </Link>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 lg:border-0 lg:pt-0">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold text-slate-600">From (UTC date)</span>
              <input
                type="date"
                name="from"
                defaultValue={q.from ?? ""}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold text-slate-600">To (UTC date)</span>
              <input
                type="date"
                name="to"
                defaultValue={q.to ?? ""}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-800"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold text-slate-600">Rows</span>
              <select
                name="limit"
                defaultValue={String(q.limit)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-800"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Apply
            </button>
            <Link
              href="/admin/phone"
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-sky-800 underline"
            >
              Clear dates
            </Link>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-slate-500">
          Showing up to {q.limit} rows, newest first. Filters use{" "}
          <code className="rounded bg-slate-100 px-1">phone_calls</code> as written by Twilio webhooks.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Could not load calls: {error.message}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="min-w-[1120px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5">Time</th>
              <th className="px-3 py-2.5">Caller</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">AI</th>
              <th className="px-3 py-2.5">Follow-up</th>
              <th className="px-3 py-2.5">Assigned</th>
              <th className="px-3 py-2.5">Outcome</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCalls.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  No calls match these filters.
                </td>
              </tr>
            ) : (
              sortedCalls.map((row) => {
                const timeRef = row.started_at ?? row.created_at;
                const whenExact = formatAdminPhoneWhen(timeRef);
                const ago = formatTimeAgo(timeRef);
                const urgency = getCallUrgency(row);
                const name = row.crm_contact_display_name?.trim() || "Unknown caller";
                const partyE164 = callerPartyE164(row.direction, row.from_e164, row.to_e164);
                const dialE164 = pickOutboundE164ForDial(partyE164);
                const uid = row.assigned_to_user_id;
                const assignedLabel =
                  row.assigned_to_label?.trim() ||
                  (uid ? staffLabelByUserId.get(uid) ?? null : null) ||
                  "—";
                const outcome = formatCallLogOutcome(row);
                const voiceSlice = readVoiceAiMetadataFromMetadata(row.metadata) ?? null;
                const aiCallerCategoryRaw = (voiceSlice?.caller_category ?? "").trim();
                const aiSpam = aiCallerCategoryRaw.toLowerCase() === "spam";
                const aiCategoryLabel =
                  aiCallerCategoryRaw !== ""
                    ? formatVoiceAiCallerCategoryLabel(aiCallerCategoryRaw)
                    : null;
                const aiSummaryText = (voiceSlice?.short_summary ?? "").trim();
                const followUpLabel = getFollowUpStatus(row);
                const statusLabel = formatCallLogStatus(row.status);
                const missed = row.status.trim().toLowerCase() === "missed";
                const contactId = row.contact_id;
                const showCreateLead = !contactId && Boolean(partyE164?.trim());
                const targets = contactId ? openByContactId[contactId] : undefined;
                const openPatientHref = targets?.patientId
                  ? `/admin/crm/patients/${targets.patientId}`
                  : null;
                const openLeadHref =
                  !openPatientHref && targets?.activeLeadId
                    ? `/admin/crm/leads/${targets.activeLeadId}`
                    : null;
                const openHref = openPatientHref ?? openLeadHref ?? `/admin/phone/${row.id}`;
                const openLabel = openPatientHref
                  ? "Patient"
                  : openLeadHref
                    ? "Lead"
                    : "Open";

                const leadIdForWorkspace = targets?.activeLeadId ?? undefined;
                const callBackHref =
                  dialE164 && canDial
                    ? buildWorkspaceKeypadCallHref({
                        dial: dialE164,
                        contactId: contactId ?? undefined,
                        leadId: leadIdForWorkspace,
                        contextName: name,
                      })
                    : null;
                const textHref =
                  contactId && canDial
                    ? buildWorkspaceSmsToContactHref({
                        contactId,
                        leadId: leadIdForWorkspace,
                      })
                    : null;

                const agoClass =
                  urgency === "critical"
                    ? "inline-flex rounded-md bg-red-100 px-1.5 py-0.5 text-sm font-semibold text-red-700"
                    : urgency === "high"
                      ? "text-sm font-medium text-red-600"
                      : missed
                        ? "text-sm font-medium text-red-600"
                        : "text-sm font-medium text-slate-900";

                const rowBg =
                  urgency === "critical"
                    ? "bg-red-100/45"
                    : urgency === "high"
                      ? "bg-red-50/50"
                      : missed
                        ? "bg-rose-50/35"
                        : "";

                return (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 last:border-0 ${rowBg} ${aiSpam ? "opacity-60" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2.5 align-top">
                      <div className={agoClass}>{ago}</div>
                      <div className="text-[11px] text-slate-500">{whenExact}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-slate-900">{name}</p>
                      <p className="font-mono text-xs text-slate-600">{partyE164 ?? "—"}</p>
                      {aiCategoryLabel ? (
                        <p className="mt-1 text-[10px] font-semibold text-indigo-800">AI: {aiCategoryLabel}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top text-slate-800">
                      {formatCallType(row.direction)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          missed
                            ? "bg-rose-100 text-rose-900"
                            : row.status.trim().toLowerCase() === "voicemail"
                              ? "bg-amber-100 text-amber-950"
                              : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td className="max-w-[13rem] px-3 py-2.5 align-top">
                      {voiceSlice != null ? (
                        <div className="flex flex-col gap-1">
                          {aiSpam ? (
                            <span className="inline-flex w-fit rounded-md border border-slate-400 bg-slate-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                              Spam
                            </span>
                          ) : null}
                          <div className="text-xs font-medium text-slate-900">
                            {aiCategoryLabel ?? "—"}
                          </div>
                          {aiSummaryText ? (
                            <div
                              className="line-clamp-1 max-w-[200px] text-xs text-slate-500"
                              title={aiSummaryText}
                            >
                              {aiSummaryText}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No AI</span>
                      )}
                    </td>
                    <td className="max-w-[9rem] px-3 py-2.5 align-top">
                      <span
                        className={
                          missed
                            ? "text-sm font-medium text-red-600"
                            : followUpLabel === "Pending"
                              ? "text-sm font-medium text-amber-800"
                              : "text-sm text-slate-500"
                        }
                      >
                        {followUpLabel}
                      </span>
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2.5 align-top text-slate-700" title={assignedLabel}>
                      {assignedLabel}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2.5 align-top text-slate-600" title={outcome}>
                      {outcome}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {callBackHref ? (
                          <Link
                            href={callBackHref}
                            className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                          >
                            Call back
                          </Link>
                        ) : (
                          <span
                            className="rounded-md border border-dashed border-slate-200 px-2 py-1 text-[11px] text-slate-400"
                            title={!canDial ? "Phone access not enabled" : "No dialable number"}
                          >
                            Call back
                          </span>
                        )}
                        {textHref ? (
                          <Link
                            href={textHref}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Text
                          </Link>
                        ) : (
                          <span
                            className="rounded-md border border-dashed border-slate-200 px-2 py-1 text-[11px] text-slate-400"
                            title={
                              !canDial
                                ? "Phone access not enabled"
                                : !contactId
                                  ? "Link contact to text from workspace"
                                  : ""
                            }
                          >
                            Text
                          </span>
                        )}
                        <Link
                          href={openHref}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                        >
                          {openLabel}
                        </Link>
                        {showCreateLead ? (
                          <CallLogCreateLeadButton phoneCallId={row.id} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[11px] text-slate-500">
        Query string for automation:{" "}
        <code className="rounded bg-slate-100 px-1">{baseQuery.toString() || "(defaults)"}</code>
      </p>
    </div>
  );
}
