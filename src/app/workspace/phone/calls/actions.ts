"use server";

import { revalidatePath } from "next/cache";

import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MarkWorkspaceMissedCallResolvedResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "invalid" | "not_found" | "not_missed" | "forbidden" | "update_failed" };

/**
 * Clears a missed call from the workspace follow-up queue without deleting the row or changing status.
 */
export async function markWorkspaceMissedCallResolved(
  callId: string
): Promise<MarkWorkspaceMissedCallResolvedResult> {
  const id = typeof callId === "string" ? callId.trim() : "";
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, error: "invalid" };
  }

  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "unauthorized" };
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, status, assigned_to_user_id, workspace_missed_followup_resolved_at")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !row?.id) {
    return { ok: false, error: "not_found" };
  }

  if (String(row.status ?? "").toLowerCase() !== "missed") {
    return { ok: false, error: "not_missed" };
  }

  if (row.workspace_missed_followup_resolved_at != null) {
    return { ok: true };
  }

  if (!canStaffAccessPhoneCallRow(staff, { assigned_to_user_id: row.assigned_to_user_id as string | null })) {
    return { ok: false, error: "forbidden" };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("phone_calls")
    .update({ workspace_missed_followup_resolved_at: now })
    .eq("id", id)
    .eq("status", "missed")
    .is("workspace_missed_followup_resolved_at", null);

  if (updErr) {
    return { ok: false, error: "update_failed" };
  }

  revalidatePath("/workspace/phone/calls");
  revalidatePath("/workspace/phone/visits");
  return { ok: true };
}
