import Link from "next/link";
import { redirect } from "next/navigation";

import {
  enrichPhoneCallRowsWithResolvedIdentity,
  formatCallLogStatus,
  mapPhoneCallQueryRowForLog,
} from "@/app/admin/phone/call-log-display";
import { getFollowUpStatus } from "@/app/admin/phone/call-log-command-center";
import {
  formatVoiceAiCallerCategoryLabel,
  readVoiceAiMetadataFromMetadata,
} from "@/app/admin/phone/_lib/voice-ai-metadata";
import type { PhoneCallRow } from "@/app/admin/phone/recent-calls-live";
import { loadCallLogContactOpenTargets } from "@/lib/phone/call-log-contact-targets";
import { PHONE_CALL_LOG_LIST_SELECT_BASE } from "@/lib/phone/phone-call-log-select";
import { PHONE_CALLS_MISSED_OR_VOICEMAIL_OR_FILTER } from "@/lib/phone/call-disposition";
import { loadEarliestPhoneCallEventAtByCallId } from "@/lib/phone/phone-call-event-times";
import {
  logPhoneCallListRowTimestampDebug,
  sortRowsByPhoneCallDisplayTimeDesc,
} from "@/lib/phone/phone-event-timestamp";
import { staffMayAccessWorkspaceCallHistory } from "@/lib/phone/staff-phone-policy";
import { shouldShowPhoneCallInWorkspaceDispatchList } from "@/lib/phone/phone-call-dispatch-list";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  isManagerOrHigher,
} from "@/lib/staff-profile";
import { displayNameFromContactsRelation } from "@/lib/crm/contact-relation-display-name";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { phoneRawToE164LookupKey } from "@/lib/phone/resolve-phone-display-identity";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { WorkspaceCallInboxCard, type CallInboxRow } from "./_components/WorkspaceCallInboxCard";
import { CallsSearchBar } from "./_components/CallsSearchBar";
import { SearchCallerLink } from "@/components/admin/SearchCallerLink";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";

export const dynamic = "force-dynamic";

/** Default list size tuned for mobile WebView; search allows a deeper slice. */
const LIST_LIMIT = 100;
const LIST_LIMIT_SEARCH = 180;

/** RLS-only probe when WORKSPACE_CALLS_DEBUG=1. */
const WORKSPACE_CALLS_PROBE_SELECT =
  "id, created_at, direction, status, owner_user_id, assigned_to_user_id, from_e164, to_e164";

function workspaceCallsDebugEnabled(): boolean {
  return process.env.WORKSPACE_CALLS_DEBUG === "1";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type WorkspaceCallFilter = "all" | "missed" | "me";

function oneSearchParam(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

function parseWorkspaceCallFilter(sp: Record<string, string | string[] | undefined>): WorkspaceCallFilter {
  const raw = oneSearchParam(sp, "filter").trim().toLowerCase();
  if (raw === "missed" || raw === "me") return raw;
  return "all";
}

function callbackNumber(direction: string | null, from: string | null, to: string | null): string | null {
  const dir = (direction ?? "").trim().toLowerCase();
  const f = (from ?? "").trim();
  const t = (to ?? "").trim();
  if (dir === "outbound") return t || null;
  return f || null;
}

function formatCallDirection(direction: string | null): string {
  const d = (direction ?? "").trim().toLowerCase();
  if (d === "inbound") return "Inbound";
  if (d === "outbound") return "Outbound";
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : "—";
}

function workspaceFollowUpLine(enriched: PhoneCallRow): string | null {
  const hint = getFollowUpStatus(enriched).trim();
  if (!hint || hint === "—") return null;
  if (hint === "⚠️ Needed") return "Follow-up needed";
  if (hint === "Pending") return "Follow-up suggested";
  return hint;
}

function workspaceTagLine(enriched: PhoneCallRow): string | null {
  const tag = (enriched.primary_tag ?? "").trim().toLowerCase();
  if (tag === "spam") return "Spam";
  const voice = readVoiceAiMetadataFromMetadata(enriched.metadata);
  const cat = (voice?.caller_category ?? "").trim().toLowerCase();
  if (cat === "spam") return "Spam";
  return null;
}

function buildCallInboxRowFromEnriched(
  raw: Record<string, unknown>,
  enriched: PhoneCallRow
): CallInboxRow {
  const party = callbackNumber(enriched.direction, enriched.from_e164, enriched.to_e164);
  const subtitlePhone = party ? formatPhoneForDisplay(party) : "—";
  const embed = raw.contacts != null ? displayNameFromContactsRelation(raw.contacts) : null;
  const title =
    enriched.crm_contact_display_name?.trim() || embed?.trim() || subtitlePhone;
  const cid = enriched.contact_id ?? enriched.resolved_contact_id ?? null;
  const showQuickSave =
    Boolean(party && phoneRawToE164LookupKey(party)) &&
    !enriched.contact_id &&
    !enriched.resolved_contact_id &&
    !enriched.party_display_suppress_quick_save;

  const voiceSlice = readVoiceAiMetadataFromMetadata(enriched.metadata);
  const aiCategoryLabel =
    voiceSlice?.caller_category?.trim() !== ""
      ? formatVoiceAiCallerCategoryLabel(String(voiceSlice?.caller_category ?? ""))
      : null;
  const aiSummaryShort = (voiceSlice?.short_summary ?? "").trim() || null;

  return {
    id: enriched.id,
    created_at: enriched.created_at,
    updated_at: enriched.updated_at,
    started_at: enriched.started_at,
    ended_at: enriched.ended_at,
    voicemail_received_at: enriched.voicemail_received_at ?? null,
    earliest_event_at: null,
    direction: enriched.direction,
    from_e164: enriched.from_e164,
    to_e164: enriched.to_e164,
    status: enriched.status,
    external_call_id: enriched.external_call_id,
    contact_id: enriched.contact_id,
    has_voicemail: enriched.has_voicemail,
    missed: enriched.missed,
    answered: enriched.answered,
    voicemail_recording_sid: enriched.voicemail_recording_sid,
    contacts: raw.contacts,
    metadata: enriched.metadata,
    primary_tag: enriched.primary_tag,
    assigned_to_user_id: enriched.assigned_to_user_id,
    workspace_missed_followup_resolved_at:
      typeof raw.workspace_missed_followup_resolved_at === "string"
        ? raw.workspace_missed_followup_resolved_at
        : null,
    call_log_display: { title, subtitlePhone, smsContactId: cid, showQuickSave },
    workspace_ui: {
      directionLabel: formatCallDirection(enriched.direction),
      statusLabel: formatCallLogStatus(enriched.status),
      aiCategoryLabel,
      aiSummaryShort,
      followUpLine: workspaceFollowUpLine(enriched),
      tagLine: workspaceTagLine(enriched),
    },
  };
}

function deepWorkspaceCallMetadataStrings(v: unknown, depth = 0): string[] {
  if (depth > 8) return [];
  if (v == null) return [];
  if (typeof v === "string") return v.trim() ? [v] : [];
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => deepWorkspaceCallMetadataStrings(x, depth + 1));
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>).flatMap((x) =>
      deepWorkspaceCallMetadataStrings(x, depth + 1)
    );
  }
  return [];
}

function workspaceCallSearchHaystack(row: CallInboxRow): string {
  const parts: string[] = [];
  const d = row.call_log_display;
  if (d?.title) parts.push(d.title);
  if (d?.subtitlePhone) parts.push(d.subtitlePhone);
  if (row.direction) parts.push(row.direction);
  if (row.status) parts.push(row.status);
  if (row.workspace_ui?.directionLabel) parts.push(row.workspace_ui.directionLabel);
  if (row.workspace_ui?.statusLabel) parts.push(row.workspace_ui.statusLabel);
  if (row.workspace_ui?.aiCategoryLabel) parts.push(row.workspace_ui.aiCategoryLabel);
  if (row.workspace_ui?.aiSummaryShort) parts.push(row.workspace_ui.aiSummaryShort);
  if (row.workspace_ui?.tagLine) parts.push(row.workspace_ui.tagLine);
  const f = typeof row.from_e164 === "string" ? row.from_e164 : "";
  const t = typeof row.to_e164 === "string" ? row.to_e164 : "";
  parts.push(f, t, f.replace(/\D/g, ""), t.replace(/\D/g, ""));
  if (row.contacts != null) {
    const emb = displayNameFromContactsRelation(row.contacts);
    if (emb) parts.push(emb);
  }
  parts.push(...deepWorkspaceCallMetadataStrings(row.metadata));
  return parts.join(" ").toLowerCase();
}

function workspaceCallMatchesQuery(row: CallInboxRow, qLower: string): boolean {
  if (!qLower) return true;
  return workspaceCallSearchHaystack(row).includes(qLower);
}

function callsFilterHref(preserveQ: string, filter: WorkspaceCallFilter): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  const qq = preserveQ.trim();
  if (qq) params.set("q", qq);
  const s = params.toString();
  return s ? `/workspace/phone/calls?${s}` : "/workspace/phone/calls";
}

function filterChipClass(active: boolean, danger?: boolean): string {
  const base = "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition";
  if (active) {
    return danger
      ? `${base} bg-rose-700 text-white`
      : `${base} bg-slate-900 text-white`;
  }
  return danger
    ? `${base} border border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100`
    : `${base} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50`;
}

export default async function WorkspaceCallsPage(props: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceCallHistory(staff)) {
    redirect("/workspace/phone/visits");
  }

  const sp = props.searchParams ? await props.searchParams : {};
  const qRaw = oneSearchParam(sp, "q").trim();
  const qLower = qRaw.toLowerCase();
  const searchActive = qLower.length > 0;
  const filter = parseWorkspaceCallFilter(sp);

  const showAdminCallLogLink = isManagerOrHigher(staff);
  const showHideFromDispatch = isAdminOrHigher(staff);
  const supabase = await createServerSupabaseClient();
  const debug = workspaceCallsDebugEnabled();

  let authUserId: string | null = null;
  let probeRowCount: number | null = null;
  let probeError: string | null = null;
  let probeErrorCode: string | null = null;

  if (debug) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authUserId = user?.id ?? null;

    const probeRes = await supabase
      .from("phone_calls")
      .select(WORKSPACE_CALLS_PROBE_SELECT)
      .order("created_at", { ascending: false })
      .limit(25);

    probeRowCount = probeRes.data?.length ?? 0;
    probeError = probeRes.error?.message ?? null;
    probeErrorCode = probeRes.error?.code ?? null;
    if (probeRes.error) {
      console.warn("[workspace/phone/calls:probe]", probeRes.error.message);
    }
  }

  const limit = searchActive ? LIST_LIMIT_SEARCH : LIST_LIMIT;
  /** Missed filter: fetch extra rows so post-migration updated_at bumps do not crowd out today's calls. */
  const fetchLimit = filter === "missed" && !searchActive ? Math.min(limit * 3, 300) : limit;
  let dbQuery = supabase
    .from("phone_calls")
    .select(PHONE_CALL_LOG_LIST_SELECT_BASE)
    .is("dispatch_hidden_at", null)
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (filter === "missed") {
    dbQuery = dbQuery.or(PHONE_CALLS_MISSED_OR_VOICEMAIL_OR_FILTER);
  } else if (filter === "me") {
    dbQuery = dbQuery.eq("assigned_to_user_id", staff.user_id);
  }

  const { data: rows, error } = await dbQuery;

  if (debug) {
    let supabaseUrlHost = "(unset)";
    try {
      supabaseUrlHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || supabaseUrlHost;
    } catch {
      supabaseUrlHost = "(invalid NEXT_PUBLIC_SUPABASE_URL)";
    }

    console.info(
      "[workspace/phone/calls:diag]",
      JSON.stringify({
        phase: "query",
        supabaseHost: supabaseUrlHost,
        authUserId,
        authMatchesStaffProfile: authUserId === staff.user_id,
        staffProfileUserId: staff.user_id,
        staffRole: staff.role,
        staffIsActive: staff.is_active,
        hasFullCallVisibility: hasFullCallVisibility(staff),
        filter,
        searchQueryLen: qRaw.length,
        searchActive,
        probeRowCount,
        probeError,
        probeErrorCode,
        mainRowCountBeforeEnrichment: rows?.length ?? 0,
        mainError: error?.message ?? null,
        mainErrorCode: error?.code ?? null,
      })
    );
  }

  if (error) {
    console.warn("[workspace/phone/calls]", error.message);
  }

  const rawRows = (rows ?? []) as Record<string, unknown>[];
  const calls = rawRows
    .map((r) => mapPhoneCallQueryRowForLog(r))
    .filter((c) =>
      shouldShowPhoneCallInWorkspaceDispatchList({
        dispatch_hidden_at: c.dispatch_hidden_at,
        metadata: c.metadata,
        direction: c.direction,
        from_e164: c.from_e164,
        to_e164: c.to_e164,
      })
    );
  const enriched = await enrichPhoneCallRowsWithResolvedIdentity(supabase, calls);

  const earliestEventAtByCallId = await loadEarliestPhoneCallEventAtByCallId(enriched.map((c) => c.id));

  const contactIds = [
    ...new Set(
      enriched.flatMap((c) => [c.contact_id, c.resolved_contact_id].filter((x): x is string => Boolean(x)))
    ),
  ];
  const openByContactId = contactIds.length > 0 ? await loadCallLogContactOpenTargets(supabase, contactIds) : {};

  const merged: CallInboxRow[] = enriched.map((e, i) => {
    const row = buildCallInboxRowFromEnriched(rawRows[i] ?? {}, e);
    const earliestEventAt = earliestEventAtByCallId.get(e.id) ?? null;
    const contactId = e.contact_id ?? e.resolved_contact_id ?? null;
    const targets = contactId ? openByContactId[contactId] : undefined;
    const withEvent = {
      ...row,
      earliest_event_at: earliestEventAt,
      workspace_ui: row.workspace_ui
        ? {
            ...row.workspace_ui,
            openPatientId: targets?.patientId ?? null,
            openLeadId: targets?.activeLeadId ?? null,
          }
        : undefined,
    };
    if (debug) {
      logPhoneCallListRowTimestampDebug(
        {
          id: withEvent.id,
          external_call_id: withEvent.external_call_id,
          created_at: withEvent.created_at,
          updated_at: withEvent.updated_at,
          started_at: withEvent.started_at,
          ended_at: withEvent.ended_at,
          voicemail_received_at: withEvent.voicemail_received_at,
          earliest_event_at: withEvent.earliest_event_at,
        },
        `workspace_calls.list.${withEvent.id}`
      );
    }
    return withEvent;
  });

  const sorted = sortRowsByPhoneCallDisplayTimeDesc(merged, (row) => ({
    started_at: row.started_at,
    voicemail_received_at: row.voicemail_received_at,
    ended_at: row.ended_at,
    created_at: row.created_at,
    earliest_event_at: row.earliest_event_at,
  }));

  const capped = searchActive ? sorted : sorted.slice(0, limit);
  const filtered = searchActive ? capped.filter((r) => workspaceCallMatchesQuery(r, qLower)) : capped;
  const noSearchHits = searchActive && filtered.length === 0;

  if (debug) {
    console.info(
      "[workspace/phone/calls:diag]",
      JSON.stringify({
        phase: "after_enrichment",
        mergedRowCount: merged.length,
        displayedRowCount: filtered.length,
        sortedRowCount: sorted.length,
      })
    );
  }

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Calls"
        actions={
          <>
            <CallsSearchBar defaultQuery={qRaw} filter={filter} />
            {qRaw.trim() ? <SearchCallerLink phone={qRaw} context="workspace" /> : null}
            <Link
              href="/workspace/phone/search"
              className="rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900"
            >
              Global search
            </Link>
            <span className="text-sm font-medium text-emerald-700" role="status">
              ● Ready
            </span>
          </>
        }
      />

      <nav
        className="mt-3 flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3"
        aria-label="Call log filters"
      >
        <Link href={callsFilterHref(qRaw, "all")} className={filterChipClass(filter === "all")} prefetch={false}>
          All
        </Link>
        <Link
          href={callsFilterHref(qRaw, "missed")}
          className={filterChipClass(filter === "missed", true)}
          prefetch={false}
        >
          Missed
        </Link>
        <Link href={callsFilterHref(qRaw, "me")} className={filterChipClass(filter === "me")} prefetch={false}>
          Assigned to me
        </Link>
      </nav>

      {noSearchHits ? (
        <p className="ws-phone-empty mt-4 px-4 py-12">No calls found.</p>
      ) : filtered.length === 0 ? (
        <p className="ws-phone-empty mt-4 px-4 py-12">No calls match this filter.</p>
      ) : (
        <ul className="mt-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
          {filtered.map((row) => (
            <WorkspaceCallInboxCard key={row.id} row={row} showHideFromDispatch={showHideFromDispatch} />
          ))}
        </ul>
      )}

      {showAdminCallLogLink ? (
        <p className="mt-8 text-center text-[11px] text-slate-500">
          Org-wide call log and tools:{" "}
          <Link href="/admin/phone" className="font-semibold text-sky-800 underline">
            Admin call log
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
