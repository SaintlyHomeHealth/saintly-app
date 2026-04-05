import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceCallInboxCard, type CallInboxRow } from "./_components/WorkspaceCallInboxCard";
import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { SoftphoneDialer } from "@/components/softphone/SoftphoneDialer";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isManagerOrHigher,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MISSED_LIMIT = 25;
const RECENT_LIMIT = 40;

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
    .order("updated_at", { ascending: false })
    .limit(MISSED_LIMIT);

  let recentQ = supabase
    .from("phone_calls")
    .select(selectRow)
    .neq("status", "missed")
    .order("updated_at", { ascending: false })
    .limit(RECENT_LIMIT);

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
        subtitle="Missed calls first, then recent activity. Completed inbound calls appear under Recent calls."
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
