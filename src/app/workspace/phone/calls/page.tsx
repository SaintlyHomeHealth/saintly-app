import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceCallInboxCard, type CallInboxRow } from "./_components/WorkspaceCallInboxCard";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { SoftphoneDialer } from "@/components/softphone/SoftphoneDialer";
import { readVoiceAiMetadataFromMetadata } from "@/app/admin/phone/_lib/voice-ai-metadata";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isManagerOrHigher,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function WorkspaceCallsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const hasFull = hasFullCallVisibility(staff);
  const showAdminCallLogLink = isManagerOrHigher(staff);
  const supabase = await createServerSupabaseClient();

  /** Same string for list queries + optional trace count (nurse scope). */
  const nurseScopeFilter = `assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null,direction.eq.inbound`;

  /** Include updated_at: DB trigger refreshes it on every status write — sort by it so "Recent" reflects last activity (e.g. completed) not only insert time. */
  const selectRow =
    "id, created_at, updated_at, started_at, ended_at, direction, from_e164, to_e164, status, external_call_id, contact_id, metadata, contacts ( full_name, first_name, last_name )";

  let missedQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .eq("status", "missed")
    .order("updated_at", { ascending: false })
    .limit(25);

  let recentQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .neq("status", "missed")
    .order("updated_at", { ascending: false })
    .limit(40);

  /** Nurses: show unassigned/own rows, plus all inbound (parent) calls even if auto-assigned on missed. */
  if (!hasFull) {
    missedQ = missedQ.or(nurseScopeFilter);
    recentQ = recentQ.or(nurseScopeFilter);
  }

  const [{ data: missedData, error: missedErr }, { data: recentData, error: recentErr }] = await Promise.all([
    missedQ,
    recentQ,
  ]);

  if (missedErr) {
    console.warn("[workspace/phone/calls] missed:", missedErr.message);
  }
  if (recentErr) {
    console.warn("[workspace/phone/calls] recent:", recentErr.message);
  }

  const missed = (missedData ?? []) as CallInboxRow[];
  const recent = (recentData ?? []) as CallInboxRow[];

  /** Set PHONE_CALLS_TRACE_EXTERNAL_ID=CA… in Vercel to prove one row’s path: list index, DB fields, truncation vs scope. */
  const traceExternalId = process.env.PHONE_CALLS_TRACE_EXTERNAL_ID?.trim() ?? "";
  if (traceExternalId) {
    const idxRecent = recent.findIndex((r) => (r.external_call_id ?? "").trim() === traceExternalId);
    const idxMissed = missed.findIndex((r) => (r.external_call_id ?? "").trim() === traceExternalId);
    const { data: traceDb, error: traceErr } = await supabase
      .from("phone_calls")
      .select(
        "id, external_call_id, status, direction, created_at, updated_at, ended_at, assigned_to_user_id"
      )
      .eq("external_call_id", traceExternalId)
      .maybeSingle();

    let exclusionReason: string | null = null;
    let rowsNewerUpdatedAtCount: number | null = null;

    if (traceErr) {
      exclusionReason = `trace_db_error:${traceErr.message}`;
    } else if (!traceDb) {
      exclusionReason = "no_row_for_external_call_id_under_session_rls_or_wrong_sid";
    } else {
      const td = traceDb as Record<string, unknown>;
      const st = typeof td.status === "string" ? td.status : "";
      const dir = typeof td.direction === "string" ? td.direction : "";
      const assignee = td.assigned_to_user_id;
      const matchesNurseScope =
        hasFull ||
        assignee === staff.user_id ||
        assignee === null ||
        dir === "inbound";

      if (st === "missed") {
        exclusionReason =
          idxMissed >= 0
            ? "in_missed_section_not_recent"
            : missed.length >= 25
              ? "likely_missed_list_truncation_25"
              : "missed_query_did_not_return_row";
      } else if (idxRecent >= 0) {
        exclusionReason = null;
      } else if (!matchesNurseScope) {
        exclusionReason = "nurse_scope_or_filter_excludes_row";
      } else {
        const u = typeof td.updated_at === "string" ? td.updated_at : null;
        if (!u) {
          exclusionReason = "trace_row_missing_updated_at";
        } else {
          let countQ = supabase
            .from("phone_calls")
            .select("id", { count: "exact", head: true })
            .neq("status", "missed")
            .gt("updated_at", u);
          if (!hasFull) {
            countQ = countQ.or(nurseScopeFilter);
          }
          const { count: newerCount, error: newerCountErr } = await countQ;
          if (newerCountErr) {
            exclusionReason = `newer_updated_at_count_error:${newerCountErr.message}`;
          } else {
            rowsNewerUpdatedAtCount = typeof newerCount === "number" ? newerCount : null;
            if (rowsNewerUpdatedAtCount !== null && rowsNewerUpdatedAtCount >= 40) {
              exclusionReason = "not_in_top_40_by_updated_at_truncation";
            } else if (recent.length < 40) {
              exclusionReason = "unexpected_not_in_recent_while_under_limit_query_bug";
            } else {
              exclusionReason = "tie_break_or_timing_same_second_investigate";
            }
          }
        }
      }
    }

    console.log("[calls-list]", {
      event: "trace_external_call",
      trace_external_id: traceExternalId,
      idx_in_recent: idxRecent,
      idx_in_missed: idxMissed,
      recent_array_length: recent.length,
      missed_array_length: missed.length,
      trace_db_row: traceDb ?? null,
      would_render_in_recent_section: idxRecent >= 0,
      would_render_in_missed_section: idxMissed >= 0,
      workspace_call_inbox_card_suppresses_completed_inbound: false,
      exclusion_or_trace_reason: exclusionReason,
      rows_with_strictly_newer_updated_at_than_trace: rowsNewerUpdatedAtCount,
    });
  }

  const recentTop = recent[0];
  const missedTop = missed[0];
  console.log("[calls-list]", {
    event: "query_summary",
    order_by: "updated_at_desc",
    recent_limit: 40,
    missed_limit: 25,
    has_full_visibility: hasFull,
    nurse_scope_applied: !hasFull,
    top_recent: recentTop
      ? {
          phone_calls_id: recentTop.id,
          external_call_id: recentTop.external_call_id ?? null,
          created_at: recentTop.created_at,
          updated_at: recentTop.updated_at ?? null,
          ended_at: recentTop.ended_at ?? null,
          status: recentTop.status,
          direction: recentTop.direction,
        }
      : null,
    top_missed: missedTop
      ? {
          phone_calls_id: missedTop.id,
          external_call_id: missedTop.external_call_id ?? null,
          created_at: missedTop.created_at,
          updated_at: missedTop.updated_at ?? null,
          status: missedTop.status,
        }
      : null,
    recent_preview: recent.slice(0, 8).map((r) => ({
      external_call_id: r.external_call_id ?? null,
      status: r.status,
      direction: r.direction,
      created_at: r.created_at,
      updated_at: r.updated_at ?? null,
      ended_at: r.ended_at ?? null,
    })),
    recent_completed_inbound_in_page: recent.filter((r) => r.status === "completed" && r.direction === "inbound")
      .length,
    possible_recent_truncation: recent.length >= 40,
  });

  if (recent.length >= 40) {
    console.warn("[calls-list] recent_limit_hit", {
      recent_limit: 40,
      note: "Rows beyond limit are omitted; raise limit or narrow filters if needed.",
    });
  }

  for (const section of [
    { name: "missed" as const, rows: missed },
    { name: "recent" as const, rows: recent },
  ]) {
    for (const r of section.rows) {
      const md =
        r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
          ? (r.metadata as Record<string, unknown>)
          : {};
      const voiceAi = readVoiceAiMetadataFromMetadata(r.metadata);
      console.log("[calls-list]", {
        section: section.name,
        phone_calls_id: r.id,
        external_call_id: r.external_call_id ?? null,
        list_query_status_filter: section.name === "missed" ? "status.eq.missed" : "status.neq.missed",
        stored_status: r.status,
        direction: r.direction,
        started_at: r.started_at ?? null,
        ended_at: r.ended_at ?? null,
        twilio_last_callback: md.twilio_last_callback ?? null,
        twilio_leg_map: md.twilio_leg_map ?? null,
        has_voice_ai_on_row: Boolean(voiceAi?.short_summary || voiceAi?.recommended_action),
      });
    }
  }

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

  const staffDisplayName =
    staff.full_name?.trim() ||
    staff.email?.trim() ||
    `${staff.role.replace(/_/g, " ")} (${staff.user_id.slice(0, 8)}…)`;

  return (
    <div className="flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Calls"
        subtitle="Missed calls first, then recent activity. Use actions to call back, text, or open a matched patient."
      />

      <div className="mt-2 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-md shadow-slate-200/50 sm:p-5">
        <SoftphoneDialer staffDisplayName={staffDisplayName} />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-800">Missed calls</h2>
          {missed.length > 0 ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900">
              {missed.length}
            </span>
          ) : null}
        </div>
        {missed.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-600">
            No missed calls in your queue.
          </p>
        ) : (
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
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Recent calls</h2>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-600">
            No other recent calls yet.
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
