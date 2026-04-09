import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceCallInboxCard, type CallInboxRow } from "./_components/WorkspaceCallInboxCard";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isManagerOrHigher,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
function mergeRecentCalls(a: CallInboxRow[], b: CallInboxRow[]): CallInboxRow[] {
  const map = new Map<string, CallInboxRow>();
  for (const row of [...a, ...b]) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()].sort((x, y) => activitySortKeyMs(y) - activitySortKeyMs(x)).slice(0, RECENT_LIMIT);
}

export default async function WorkspaceCallsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const hasFull = hasFullCallVisibility(staff);
  const showAdminCallLogLink = isManagerOrHigher(staff);
  const supabase = await createServerSupabaseClient();

  const nurseScopeFilter = `assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null,direction.eq.inbound`;

  const selectRow =
    "id, created_at, updated_at, started_at, ended_at, direction, from_e164, to_e164, status, external_call_id, contact_id, metadata, contacts ( full_name, first_name, last_name )";

  let missedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .eq("status", "missed")
    .is("workspace_missed_followup_resolved_at", null)
    .order("updated_at", { ascending: false })
    .limit(MISSED_LIMIT);

  let recentNonMissedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .neq("status", "missed")
    .order("updated_at", { ascending: false })
    .limit(RECENT_LIMIT);

  let recentResolvedMissedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .eq("status", "missed")
    .not("workspace_missed_followup_resolved_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(RECENT_LIMIT);

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

  const missed = (missedData ?? []) as CallInboxRow[];
  const recent = mergeRecentCalls(
    (recentNonMissedData ?? []) as CallInboxRow[],
    (recentResolvedMissedData ?? []) as CallInboxRow[]
  );

  const allContacts = [...missed, ...recent]
    .map((r) => (typeof r.contact_id === "string" ? r.contact_id : ""))
    .filter(Boolean);
  const contactIds = [...new Set(allContacts)];

  const patientByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    if (hasFull) {
      const { data: prows } = await supabase.from("patients").select("id, contact_id").in("contact_id", contactIds);
      for (const p of prows ?? []) {
        const cid = typeof p.contact_id === "string" ? p.contact_id : "";
        const pid = typeof p.id === "string" ? p.id : "";
        if (cid && pid && !patientByContact.has(cid)) patientByContact.set(cid, pid);
      }
    } else {
      const { data: asnRows } = await supabase
        .from("patient_assignments")
        .select("patient_id, patients ( id, contact_id )")
        .eq("assigned_user_id", staff.user_id)
        .eq("is_active", true);
      for (const a of asnRows ?? []) {
        const pRaw = (a as { patients?: unknown }).patients;
        const p = pRaw && typeof pRaw === "object" && !Array.isArray(pRaw) ? (pRaw as { id?: unknown; contact_id?: unknown }) : null;
        const pid = p && typeof p.id === "string" ? p.id : "";
        const cid = p && typeof p.contact_id === "string" ? p.contact_id : "";
        if (pid && cid && contactIds.includes(cid) && !patientByContact.has(cid)) {
          patientByContact.set(cid, pid);
        }
      }
    }
  }

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Calls"
        subtitle="Your call history and timeline. Missed calls stay at the top until you handle them. To dial out, use Keypad."
      />

      <p className="mt-2 text-sm text-slate-600" role="status">
        🟢 Ready for calls
      </p>

      {missed.length > 0 ? (
        <section className="mt-6" aria-labelledby="workspace-calls-missed-heading">
          <div className="mb-4 rounded-2xl border border-rose-200/70 bg-gradient-to-b from-rose-50/90 to-white px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-800">Needs attention</p>
                <h2 id="workspace-calls-missed-heading" className="mt-1 text-sm font-semibold text-phone-navy">
                  Missed calls
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">Return or follow up on these when you can.</p>
              </div>
              <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
                {missed.length}
              </span>
            </div>
          </div>
          <ul className="flex flex-col gap-3">
            {missed.map((row) => (
              <WorkspaceCallInboxCard
                key={row.id}
                row={row}
                variant="missed"
                patientId={
                  typeof row.contact_id === "string" ? patientByContact.get(row.contact_id) ?? null : null
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className={missed.length > 0 ? "mt-10" : "mt-8"}
        aria-labelledby="workspace-calls-recent-heading"
      >
        <div className="mb-4">
          <h2
            id="workspace-calls-recent-heading"
            className="text-xs font-bold uppercase tracking-[0.18em] text-phone-ink"
          >
            RECENT CALLS
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Latest activity first — answered calls, outbound, and other updates in one list.
          </p>
        </div>
        <div className="rounded-[28px] border border-sky-100/80 bg-phone-powder/40 p-4 shadow-sm shadow-sky-950/5 sm:p-5">
          {recent.length === 0 ? (
            <p className="ws-phone-empty px-4 py-8">
              No recent calls yet. Activity will show here after you place or receive calls.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recent.map((row) => (
                <WorkspaceCallInboxCard
                  key={row.id}
                  row={row}
                  variant="recent"
                  patientId={
                    typeof row.contact_id === "string" ? patientByContact.get(row.contact_id) ?? null : null
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </section>

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
