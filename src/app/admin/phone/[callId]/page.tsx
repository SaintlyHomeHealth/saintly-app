import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  assignPhoneCallFormAction,
  claimPhoneCallFormAction,
  createContactIntakeFromPhoneCall,
  createPhoneCallNote,
  unassignPhoneCallFormAction,
} from "../actions";
import { supabaseAdmin } from "@/lib/admin";
import { loadCrmContextForPhoneCall } from "@/lib/phone/crm-context-for-call";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { canStaffAccessPhoneCallRow, canStaffClaimPhoneCall } from "@/lib/phone/staff-call-access";
import {
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";

import { buildTranscriptMessages } from "@/components/softphone/build-transcript-messages";
import type { CallContextVoiceAi } from "@/components/softphone/WorkspaceSoftphoneProvider";
import { CallDetailTranscriptThread } from "@/components/phone/CallDetailTranscriptThread";
import { CallSavedOutputsViewer } from "@/components/phone/CallSavedOutputsViewer";
import {
  parseLiveTranscriptEntriesFromMetadata,
  readUnclampedLiveTranscriptExcerpt,
} from "@/lib/phone/live-transcript-entries";
import type { PhoneCallRow } from "../recent-calls-live";
import {
  formatUrgencyLabel,
  formatVoiceAiCallerCategoryLabel,
  formatVoiceAiRouteTargetLabel,
  readVoiceAiMetadata,
} from "../_lib/voice-ai-metadata";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ callId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CallDetail = {
  id: string;
  created_at: string;
  updated_at: string;
  external_call_id: string;
  direction: string;
  from_e164: string | null;
  to_e164: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  voicemail_recording_sid: string | null;
  voicemail_duration_seconds: number | null;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  assigned_to_label: string | null;
  primary_tag: string | null;
  contact_id: string | null;
  metadata: Record<string, unknown> | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
};

type NoteRow = {
  id: string;
  body: string;
  created_at: string;
  created_by_user_id: string | null;
};

function effectiveDurationSeconds(call: CallDetail): number | null {
  if (call.duration_seconds != null && Number.isFinite(call.duration_seconds)) {
    return call.duration_seconds;
  }
  if (call.started_at && call.ended_at) {
    const a = new Date(call.started_at).getTime();
    const b = new Date(call.ended_at).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      return Math.round((b - a) / 1000);
    }
  }
  return null;
}

/** Primary caller/callee number for display (inbound: From, outbound: To). */
function primaryCallNumber(c: CallDetail): string {
  const d = c.direction.trim().toLowerCase();
  if (d === "outbound") {
    return c.to_e164?.trim() || "—";
  }
  return c.from_e164?.trim() || "—";
}

function intakePhoneDefault(c: CallDetail): string {
  const n = primaryCallNumber(c);
  return n === "—" ? "" : n;
}

function intakeErrLabel(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "intake":
      return "Could not save contact / intake. Check fields and try again.";
    case "intake_phone":
      return "Enter a valid phone number (10 digits or +1… E.164).";
    case "intake_exists":
      return "This call already has a linked CRM contact.";
    case "intake_forbidden":
      return "You do not have permission to add intake on this call.";
    default:
      return "Something went wrong.";
  }
}

export default async function AdminPhoneCallDetailPage({ params, searchParams }: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    redirect("/admin");
  }

  const hasFull = hasFullCallVisibility(staff);
  const canUnassign = isAdminOrHigher(staff);

  const { callId } = await params;
  if (!callId || !UUID_RE.test(callId)) {
    notFound();
  }

  const sp = (await searchParams) ?? {};
  const okRaw = sp.ok;
  const errRaw = sp.err;
  const okCode = typeof okRaw === "string" ? okRaw : undefined;
  const errCode = typeof errRaw === "string" ? errRaw : undefined;
  const intakeErrMsg = errCode?.startsWith("intake") ? intakeErrLabel(errCode) : null;
  const showIntakeOk = okCode === "intake";

  const { data: call, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select(
      "id, created_at, updated_at, external_call_id, direction, from_e164, to_e164, status, started_at, ended_at, duration_seconds, voicemail_recording_sid, voicemail_duration_seconds, assigned_to_user_id, assigned_at, assigned_to_label, primary_tag, contact_id, metadata"
    )
    .eq("id", callId)
    .maybeSingle();

  if (callErr) {
    console.warn("[admin/phone/callId] load call:", callErr.message);
    notFound();
  }
  if (!call) {
    notFound();
  }

  const c = call as CallDetail;

  const voiceAiSlice = readVoiceAiMetadata({
    metadata:
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? (c.metadata as PhoneCallRow["metadata"])
        : null,
  } as PhoneCallRow);

  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: c.assigned_to_user_id,
    })
  ) {
    notFound();
  }

  const canClaim = canStaffClaimPhoneCall(staff, {
    assigned_to_user_id: c.assigned_to_user_id,
  });

  let assignableStaff: { user_id: string; label: string }[] = [];
  if (hasFull) {
    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .not("user_id", "is", null)
      .eq("is_active", true)
      .order("email", { ascending: true });
    if (staffErr) {
      console.warn("[admin/phone/callId] assignable staff:", staffErr.message);
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

  const crm = await loadCrmContextForPhoneCall(
    supabaseAdmin,
    typeof c.contact_id === "string" ? c.contact_id : null
  );

  const { data: taskRows } = await supabaseAdmin
    .from("phone_call_tasks")
    .select("id, title, status, priority, created_at")
    .eq("phone_call_id", callId)
    .order("created_at", { ascending: false });

  const tasks = (taskRows ?? []) as TaskRow[];

  const { data: noteRows } = await supabaseAdmin
    .from("phone_call_notes")
    .select("id, body, created_at, created_by_user_id")
    .eq("phone_call_id", callId)
    .order("created_at", { ascending: false });

  const notes = (noteRows ?? []) as NoteRow[];

  const authorIds = [...new Set(notes.map((n) => n.created_by_user_id).filter(Boolean))] as string[];
  const authorLabelById: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email")
      .in("user_id", authorIds);
    for (const p of profiles ?? []) {
      const uid = p.user_id as string;
      const em = (p.email as string | null)?.trim();
      authorLabelById[uid] = em || uid.slice(0, 8) + "…";
    }
  }

  const effDur = effectiveDurationSeconds(c);
  const st = c.status.trim();
  const caller = primaryCallNumber(c);
  const phoneDefault = intakePhoneDefault(c);

  const voiceAiRaw =
    c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
      ? (c.metadata as Record<string, unknown>).voice_ai
      : undefined;
  const liveEntries = parseLiveTranscriptEntriesFromMetadata(voiceAiRaw);
  const liveExcerpt = readUnclampedLiveTranscriptExcerpt(voiceAiRaw);
  const voiceAiForTranscript = {
    live_transcript_entries: liveEntries.length > 0 ? liveEntries : null,
    live_transcript_excerpt: liveExcerpt,
  } as CallContextVoiceAi;
  /** Same builder as softphone post-call review: entries first, else excerpt split into lines. */
  const transcriptBubbles = buildTranscriptMessages(voiceAiForTranscript, { humanSpeechOnly: false });

  return (
    <div className="space-y-8 p-6">
      <div>
        <Link
          href="/admin/phone"
          className="text-sm font-semibold text-sky-800 underline-offset-2 hover:underline"
        >
          ← Back to phone calls
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Phone CRM</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Call detail</h1>
      </div>

      {showIntakeOk ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
          Contact linked and saved.
        </p>
      ) : null}
      {intakeErrMsg ? (
        <p className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900">
          {intakeErrMsg}
        </p>
      ) : null}

      <section className="rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.12)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Review</p>
        <h2 className="mt-1 text-sm font-semibold text-slate-900">Transcript</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          From <code className="rounded-md bg-slate-100/90 px-1 py-0.5 font-mono text-[11px]">metadata.voice_ai</code>{" "}
          — structured lines when available; otherwise a legacy excerpt as separate bubbles.
        </p>
        <div className="mt-5">
          <CallDetailTranscriptThread
            bubbles={transcriptBubbles}
            callerLabel={caller !== "—" ? caller : "Caller"}
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-[0_12px_40px_-18px_rgba(15,23,42,0.12)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Artifacts</p>
        <h2 className="mt-1 text-sm font-semibold text-slate-900">Saved outputs</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          SOAP, Call Summary, and Intake Summary from the softphone transcript (read-only).
        </p>
        <div className="mt-5">
          <CallSavedOutputsViewer phoneCallId={c.id} embedded heading="Saved outputs" />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Overview</h2>
        <p className="mt-3 font-mono text-2xl font-semibold tracking-tight text-slate-900">{caller}</p>
        <p className="mt-1 text-xs text-slate-500">
          {c.direction.trim().toLowerCase() === "outbound" ? "Dialed number (outbound)" : "Caller ID (inbound)"}
        </p>
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Status</dt>
            <dd className="mt-0.5 font-medium text-slate-900">{st}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Direction</dt>
            <dd className="mt-0.5 text-slate-800">{c.direction}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Duration</dt>
            <dd className="mt-0.5 text-slate-800">{effDur != null ? `${effDur}s` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">From / To</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-700">
              {c.from_e164 ?? "—"} → {c.to_e164 ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Created</dt>
            <dd className="mt-0.5 text-slate-800">{formatAdminPhoneWhen(c.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Updated</dt>
            <dd className="mt-0.5 text-slate-800">{formatAdminPhoneWhen(c.updated_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Started</dt>
            <dd className="mt-0.5 text-slate-800">
              {c.started_at ? formatAdminPhoneWhen(c.started_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Ended</dt>
            <dd className="mt-0.5 text-slate-800">
              {c.ended_at ? formatAdminPhoneWhen(c.ended_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">External ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-600">{c.external_call_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Call ID</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-600">{c.id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Primary tag</dt>
            <dd className="mt-0.5 text-slate-800">{c.primary_tag?.trim() ? c.primary_tag : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Voicemail</dt>
            <dd className="mt-0.5 text-slate-800">
              {c.voicemail_recording_sid
                ? `Yes${c.voicemail_duration_seconds != null ? ` · ${c.voicemail_duration_seconds}s` : ""}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-[28px] border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">AI call summary</h2>
        <p className="mt-1 text-xs text-slate-500">
          From <code className="rounded bg-white/80 px-1">metadata.voice_ai</code> after the call ends (suggestions
          only; not saved CRM). Word-for-word transcript is in the Transcript section above; not duplicated here.
        </p>
        {voiceAiSlice ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Caller category</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {voiceAiSlice.caller_category
                  ? formatVoiceAiCallerCategoryLabel(voiceAiSlice.caller_category)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Urgency</dt>
              <dd className="mt-0.5 text-slate-800">{formatUrgencyLabel(voiceAiSlice.urgency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Route target</dt>
              <dd className="mt-0.5 text-slate-800">
                {voiceAiSlice.route_target
                  ? formatVoiceAiRouteTargetLabel(voiceAiSlice.route_target)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Callback needed</dt>
              <dd className="mt-0.5 text-slate-800">{voiceAiSlice.callback_needed ? "Yes" : "No"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">Summary</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">
                {voiceAiSlice.short_summary?.trim() ? voiceAiSlice.short_summary : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">Recommended next step</dt>
              <dd className="mt-0.5 text-slate-800">{voiceAiSlice.recommended_action ?? "—"}</dd>
            </div>
            {voiceAiSlice.source ? (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500">Source</dt>
                <dd className="mt-0.5 text-slate-700">
                  {voiceAiSlice.source === "live_receptionist"
                    ? "Live call (AI receptionist)"
                    : voiceAiSlice.source === "background"
                      ? "After call (automatic)"
                      : voiceAiSlice.source}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            No AI classification on this call yet. It appears when background or live receptionist AI has run and{" "}
            <code className="rounded bg-white/80 px-1">OPENAI_API_KEY</code> is configured.
          </p>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Assignment</h2>
        <p className="mt-1 text-xs text-slate-500">
          {hasFull
            ? "Managers and admins can assign to any staff login. Nurses can claim unassigned calls only."
            : "Claim unassigned calls in your queue. Reassign is limited to managers and admins."}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Assigned to</p>
            <p className="mt-1 text-base font-medium text-slate-900">
              {c.assigned_to_user_id
                ? c.assigned_to_label?.trim() || c.assigned_to_user_id.slice(0, 8) + "…"
                : "Unassigned"}
            </p>
            {c.assigned_at ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Since {formatAdminPhoneWhen(c.assigned_at)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canClaim && !c.assigned_to_user_id ? (
              <form action={claimPhoneCallFormAction}>
                <input type="hidden" name="callId" value={c.id} />
                <button
                  type="submit"
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
                >
                  Claim call
                </button>
              </form>
            ) : null}

            {hasFull && assignableStaff.length > 0 ? (
              <form action={assignPhoneCallFormAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="callId" value={c.id} />
                <label className="text-xs font-medium text-slate-600">
                  Reassign
                  <select
                    name="assignToUserId"
                    defaultValue={c.assigned_to_user_id ?? ""}
                    required
                    className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                  >
                    <option value="" disabled>
                      Select staff…
                    </option>
                    {c.assigned_to_user_id &&
                    !assignableStaff.some((s) => s.user_id === c.assigned_to_user_id) ? (
                      <option value={c.assigned_to_user_id}>
                        {c.assigned_to_label?.trim() ||
                          `${c.assigned_to_user_id.slice(0, 8)}…`}{" "}
                        (current)
                      </option>
                    ) : null}
                    {assignableStaff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Save assignment
                </button>
              </form>
            ) : null}

            {canUnassign && c.assigned_to_user_id ? (
              <form action={unassignPhoneCallFormAction}>
                <input type="hidden" name="callId" value={c.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Unassign
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">CRM contact</h2>
        <p className="mt-1 text-xs text-slate-500">
          Linked via <code className="rounded bg-slate-100 px-1">phone_calls.contact_id</code>.
        </p>
        {crm.contactId ? (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-slate-500">Name</dt>
              <dd className="mt-0.5 text-slate-800">{crm.displayName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Type</dt>
              <dd className="mt-0.5 text-slate-800">{crm.contactType?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Primary phone</dt>
              <dd className="mt-0.5 font-mono text-xs text-slate-800">{crm.primaryPhone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Email</dt>
              <dd className="mt-0.5 text-slate-800">{crm.email ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-500">Contact ID</dt>
              <dd className="mt-0.5 font-mono text-xs text-slate-600">{crm.contactId}</dd>
            </div>
          </dl>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <p className="text-sm font-medium text-slate-800">Create contact / intake</p>
            <p className="mt-1 text-xs text-slate-600">
              Add a minimal CRM record and link it to this call. No full CRM workflow required.
            </p>
            <form action={createContactIntakeFromPhoneCall} className="mt-4 grid max-w-lg gap-3">
              <input type="hidden" name="phoneCallId" value={c.id} />
              <label className="block text-xs font-semibold text-slate-700">
                Name
                <input
                  name="fullName"
                  required
                  maxLength={500}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                  placeholder="Full name"
                  autoComplete="name"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Phone
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  defaultValue={phoneDefault}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900"
                  placeholder="+1 or 10-digit"
                  autoComplete="tel"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Type
                <select
                  name="intakeType"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  defaultValue="patient"
                >
                  <option value="patient">Patient</option>
                  <option value="family">Family</option>
                  <option value="referral">Referral</option>
                </select>
              </label>
              <button
                type="submit"
                className="inline-flex w-fit rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save &amp; link to call
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No tasks for this call.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                <span className="font-medium text-slate-800">{t.title}</span>
                <span className="text-slate-500">
                  {" "}
                  · {t.status} · {t.priority}
                </span>
                <p className="text-xs text-slate-500">{formatAdminPhoneWhen(t.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Notes</h2>
        <ul className="mt-4 space-y-4">
          {notes.length === 0 ? (
            <li className="text-sm text-slate-500">No notes yet.</li>
          ) : (
            notes.map((n) => {
              const who = n.created_by_user_id
                ? authorLabelById[n.created_by_user_id] ?? n.created_by_user_id.slice(0, 8) + "…"
                : "System";
              return (
                <li key={n.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <p className="text-xs text-slate-500">
                    {formatAdminPhoneWhen(n.created_at)} · {who}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{n.body}</p>
                </li>
              );
            })
          )}
        </ul>

        <form action={createPhoneCallNote} className="mt-6 flex flex-col gap-2">
          <input type="hidden" name="phoneCallId" value={c.id} />
          <label className="text-xs font-medium text-slate-600" htmlFor="phone-call-note-body">
            Add note
          </label>
          <textarea
            id="phone-call-note-body"
            name="body"
            required
            rows={4}
            maxLength={20000}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
            placeholder="Internal note (visible to staff on this page only)"
          />
          <button
            type="submit"
            className="self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Save note
          </button>
        </form>
      </section>
    </div>
  );
}
