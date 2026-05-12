import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

export type CallLogContactOpenTarget = {
  patientId: string | null;
  activeLeadId: string | null;
};

/**
 * Resolve patient + active lead ids for CRM deep links from `contacts.id` keys.
 */
export async function loadCallLogContactOpenTargets(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  contactIds: string[]
): Promise<Record<string, CallLogContactOpenTarget>> {
  const out: Record<string, CallLogContactOpenTarget> = {};
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

  const { data: leadRows, error: leadsErr } = await leadRowsActiveOnly(
    supabase
      .from("leads")
      .select("id, contact_id, status, created_at")
      .in("contact_id", contactIds)
      .order("created_at", { ascending: false })
  );

  if (leadsErr) {
    console.warn("[call_log_contact_targets] leads:", leadsErr.message);
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
