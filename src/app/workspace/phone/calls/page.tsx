import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceCallInboxCard, type CallInboxRow } from "./_components/WorkspaceCallInboxCard";
import { CallsSearchBar } from "./_components/CallsSearchBar";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { staffMayAccessWorkspaceCallHistory } from "@/lib/phone/staff-phone-policy";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isManagerOrHigher,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { displayNameFromContactsRelation } from "@/lib/crm/contact-relation-display-name";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  phoneRawToE164LookupKey,
  resolvePhoneDisplayIdentityBatch,
} from "@/lib/phone/resolve-phone-display-identity";

const MISSED_LIMIT = 25;
const RECENT_LIMIT = 40;

function activitySortKeyMs(row: CallInboxRow): number {
  const u = row.updated_at;
  const c = row.created_at;
  const iso = typeof u === "string" && u.trim() ? u : typeof c === "string" ? c : null;
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Merge non-missed rows with missed-but-workspace-resolved rows; sort by latest activity. */
function mergeRecentCalls(a: CallInboxRow[], b: CallInboxRow[], cap: number): CallInboxRow[] {
  const map = new Map<string, CallInboxRow>();
  for (const row of [...a, ...b]) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()].sort((x, y) => activitySortKeyMs(y) - activitySortKeyMs(x)).slice(0, cap);
}

function callbackNumber(direction: string | null, from: string | null, to: string | null): string | null {
  const dir = (direction ?? "").trim().toLowerCase();
  const f = (from ?? "").trim();
  const t = (to ?? "").trim();
  if (dir === "outbound") return t || null;
  return f || null;
}

function enrichWorkspaceCallRow(
  row: CallInboxRow,
  idMap: Awaited<ReturnType<typeof resolvePhoneDisplayIdentityBatch>>
): CallInboxRow {
  const party = callbackNumber(row.direction, row.from_e164, row.to_e164);
  const key = phoneRawToE164LookupKey(party ?? "");
  const id = key ? idMap.get(key) : undefined;
  const embed = displayNameFromContactsRelation(row.contacts);
  const subtitlePhone = party ? formatPhoneForDisplay(party) : "—";

  let title: string;
  if (id?.resolvedFromEntity && id.displayTitle.trim()) {
    title = id.displayTitle.trim();
  } else if (embed) {
    title = embed;
  } else {
    title = id?.displayTitle?.trim() || subtitlePhone;
  }

  const smsContactId = row.contact_id ?? id?.contactId ?? null;
  const showQuickSave =
    Boolean(party && phoneRawToE164LookupKey(party)) && !row.contact_id && !id?.suppressQuickSave;

  return { ...row, call_log_display: { title, subtitlePhone, smsContactId, showQuickSave } };
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function oneSearchParam(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

function deepWorkspaceCallMetadataStrings(v: unknown, depth = 0): string[] {
  if (depth > 10) return [];
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
  const f = typeof row.from_e164 === "string" ? row.from_e164 : "";
  const t = typeof row.to_e164 === "string" ? row.to_e164 : "";
  parts.push(f, t, f.replace(/\D/g, ""), t.replace(/\D/g, ""));
  const emb = displayNameFromContactsRelation(row.contacts);
  if (emb) parts.push(emb);
  parts.push(...deepWorkspaceCallMetadataStrings(row.metadata));
  return parts.join(" ").toLowerCase();
}

function workspaceCallMatchesQuery(row: CallInboxRow, qLower: string): boolean {
  if (!qLower) return true;
  return workspaceCallSearchHaystack(row).includes(qLower);
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

  const hasFull = hasFullCallVisibility(staff);
  const showAdminCallLogLink = isManagerOrHigher(staff);
  const supabase = await createServerSupabaseClient();

  const nurseScopeFilter = `assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null,direction.eq.inbound`;

  const selectRow =
    "id, created_at, updated_at, started_at, ended_at, direction, from_e164, to_e164, status, external_call_id, contact_id, metadata, contacts ( full_name, first_name, last_name, organization_name )";

  let missedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .eq("status", "missed")
    .is("workspace_missed_followup_resolved_at", null)
    .order("updated_at", { ascending: false })
    .limit(searchActive ? 120 : MISSED_LIMIT);

  let recentNonMissedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .neq("status", "missed")
    .order("updated_at", { ascending: false })
    .limit(searchActive ? 220 : RECENT_LIMIT);

  let recentResolvedMissedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .eq("status", "missed")
    .not("workspace_missed_followup_resolved_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(searchActive ? 220 : RECENT_LIMIT);

  if (!hasFull) {
    missedQ = missedQ.or(nurseScopeFilter);
    recentNonMissedQ = recentNonMissedQ.or(nurseScopeFilter);
    recentResolvedMissedQ = recentResolvedMissedQ.or(nurseScopeFilter);
  }

  const [
    { data: missedData, error: missedErr },
    { data: recentNonMissedData, error: recentNonMissedErr },
    { data: recentResolvedMissedData, error: recentResolvedMissedErr },
  ] = await Promise.all([missedQ, recentNonMissedQ, recentResolvedMissedQ]);

  if (missedErr) {
    console.warn("[workspace/phone/calls] missed:", missedErr.message);
  }
  if (recentNonMissedErr) {
    console.warn("[workspace/phone/calls] recent (non-missed):", recentNonMissedErr.message);
  }
  if (recentResolvedMissedErr) {
    console.warn("[workspace/phone/calls] recent (resolved missed):", recentResolvedMissedErr.message);
  }

  const recentMergeCap = searchActive ? 220 : RECENT_LIMIT;
  const missed = (missedData ?? []) as CallInboxRow[];
  const recent = mergeRecentCalls(
    (recentNonMissedData ?? []) as CallInboxRow[],
    (recentResolvedMissedData ?? []) as CallInboxRow[],
    recentMergeCap
  );

  const forResolve = [...missed, ...recent];
  const parties = forResolve.map((r) => callbackNumber(r.direction, r.from_e164, r.to_e164));
  const identityByE164 = await resolvePhoneDisplayIdentityBatch(supabase, parties);
  const missedDisplay = missed.map((r) => enrichWorkspaceCallRow(r, identityByE164));
  const recentDisplay = recent.map((r) => enrichWorkspaceCallRow(r, identityByE164));

  const missedFiltered = searchActive ? missedDisplay.filter((r) => workspaceCallMatchesQuery(r, qLower)) : missedDisplay;
  const recentFiltered = searchActive ? recentDisplay.filter((r) => workspaceCallMatchesQuery(r, qLower)) : recentDisplay;
  const noSearchHits = searchActive && missedFiltered.length === 0 && recentFiltered.length === 0;

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Calls"
        actions={
          <>
            <CallsSearchBar defaultQuery={qRaw} />
            <span className="text-sm font-medium text-emerald-700" role="status">
              ● Ready
            </span>
          </>
        }
      />

      {noSearchHits ? (
        <p className="ws-phone-empty mt-4 px-4 py-12">No calls found.</p>
      ) : (
        <>
          {missedFiltered.length > 0 ? (
            <section className="mt-5" aria-labelledby="workspace-calls-missed-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/50 pb-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-800">Needs attention</p>
                  <h2 id="workspace-calls-missed-heading" className="text-sm font-semibold text-phone-navy">
                    Missed calls
                  </h2>
                </div>
                <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
                  {missedFiltered.length}
                </span>
              </div>
              <ul className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                {missedFiltered.map((row) => (
                  <WorkspaceCallInboxCard key={row.id} row={row} variant="missed" />
                ))}
              </ul>
            </section>
          ) : null}

          <section
            className={missedFiltered.length > 0 ? "mt-8" : "mt-5"}
            aria-labelledby="workspace-calls-recent-heading"
          >
            <div className="mb-3">
              <h2
                id="workspace-calls-recent-heading"
                className="text-xs font-bold uppercase tracking-[0.18em] text-phone-ink"
              >
                Recent calls
              </h2>
            </div>
            <div>
              {recentFiltered.length === 0 ? (
                <p className="ws-phone-empty px-4 py-8">
                  {searchActive ? "No matching recent calls." : "No recent calls yet."}
                </p>
              ) : (
                <ul className="overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                  {recentFiltered.map((row) => (
                    <WorkspaceCallInboxCard key={row.id} row={row} variant="recent" />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
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
