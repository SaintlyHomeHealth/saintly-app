import "server-only";

import { supabaseAdmin } from "@/lib/admin";

function displayNameFromContact(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "Patient";
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== "object") return "Patient";
  const full = "full_name" in c && typeof (c as { full_name?: string }).full_name === "string" ? (c as { full_name: string }).full_name.trim() : "";
  if (full) return full;
  const fn = "first_name" in c && typeof (c as { first_name?: string }).first_name === "string" ? (c as { first_name: string }).first_name : "";
  const ln = "last_name" in c && typeof (c as { last_name?: string }).last_name === "string" ? (c as { last_name: string }).last_name : "";
  const j = [fn, ln].filter(Boolean).join(" ").trim();
  return j || "Patient";
}

export type AssignablePatientOption = { id: string; label: string };

/**
 * Patients this nurse may document payroll visits for (assignments + active dispatch visits).
 */
export async function loadAssignablePatientsForNurse(userId: string): Promise<AssignablePatientOption[]> {
  const patientIdSet = new Set<string>();

  const [{ data: asnRows }, { data: visitAssigneeRows }] = await Promise.all([
    supabaseAdmin.from("patient_assignments").select("patient_id").eq("assigned_user_id", userId).eq("is_active", true),
    supabaseAdmin
      .from("patient_visits")
      .select("patient_id")
      .eq("assigned_user_id", userId)
      .in("status", ["scheduled", "confirmed", "en_route", "arrived", "missed", "rescheduled"])
      .limit(500),
  ]);

  for (const r of asnRows ?? []) {
    const id = String((r as { patient_id?: string }).patient_id ?? "").trim();
    if (id) patientIdSet.add(id);
  }
  for (const r of visitAssigneeRows ?? []) {
    const id = String((r as { patient_id?: string }).patient_id ?? "").trim();
    if (id) patientIdSet.add(id);
  }

  const patientIds = [...patientIdSet];
  if (patientIds.length === 0) return [];

  const { data: pRows } = await supabaseAdmin
    .from("patients")
    .select("id, contacts ( full_name, first_name, last_name )")
    .in("id", patientIds)
    .is("archived_at", null)
    .eq("is_test", false);

  const out: AssignablePatientOption[] = [];
  for (const row of pRows ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const label = displayNameFromContact((row as { contacts?: unknown }).contacts);
    out.push({ id, label });
  }

  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function nurseMayUsePatient(userId: string, patientId: string): Promise<boolean> {
  const list = await loadAssignablePatientsForNurse(userId);
  return list.some((p) => p.id === patientId);
}
