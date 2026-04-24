import { NextResponse, type NextRequest } from "next/server";

import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { supabaseAdmin } from "@/lib/admin";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { fetchActiveAssignedPatientIdsForStaff } from "@/lib/internal-chat/assigned-patients";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { canSearchRecruitsInChat } from "@/lib/internal-chat/reference-validate";
import type { InternalChatRefKind } from "@/lib/internal-chat/internal-chat-ref-kinds";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher, isPhoneWorkspaceUser, type StaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const KINDS: InternalChatRefKind[] = ["patient", "lead", "facility", "employee", "recruit"];

function labelFromContactEmb(emb: unknown): string {
  if (!emb || typeof emb !== "object") return "—";
  const o = Array.isArray(emb) ? emb[0] : emb;
  if (!o || typeof o !== "object") return "—";
  return displayNameFromContact(o as Parameters<typeof displayNameFromContact>[0]);
}

async function searchPatients(staff: StaffProfile, q: string): Promise<Array<{ id: string; label: string }>> {
  const qLower = q.toLowerCase();
  if (isAdminOrHigher(staff)) {
    const { data, error } = await supabaseAdmin
      .from("patients")
      .select("id, patient_status, archived_at, is_test, contacts ( full_name, first_name, last_name )")
      .eq("patient_status", "active")
      .is("archived_at", null)
      .limit(500);
    if (error) {
      console.warn("[references/patients admin]", error.message);
      return [];
    }
    const out: Array<{ id: string; label: string }> = [];
    for (const row of data ?? []) {
      if ((row as { is_test?: boolean | null }).is_test === true) continue;
      const label = labelFromContactEmb((row as { contacts?: unknown }).contacts);
      if (!label || label === "—") continue;
      if (q.length > 0 && !label.toLowerCase().includes(qLower)) continue;
      out.push({ id: String(row.id), label });
    }
    out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    return out.slice(0, 20);
  }

  const allowed = await fetchActiveAssignedPatientIdsForStaff(staff.user_id);
  const ids = [...allowed];
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("id, contacts ( full_name, first_name, last_name )")
    .in("id", ids)
    .limit(300);
  if (error) {
    console.warn("[references/patients]", error.message);
    return [];
  }
  const out: Array<{ id: string; label: string }> = [];
  for (const row of data ?? []) {
    const label = labelFromContactEmb((row as { contacts?: unknown }).contacts);
    if (!label || label === "—") continue;
    if (q.length > 0 && !label.toLowerCase().includes(qLower)) continue;
    out.push({ id: String(row.id), label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out.slice(0, 20);
}

async function searchLeads(staff: StaffProfile, q: string): Promise<Array<{ id: string; label: string }>> {
  const qLower = q.toLowerCase();
  const { data, error } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, owner_user_id, contacts ( id, full_name, first_name, last_name, owner_user_id )")
      .order("created_at", { ascending: false })
      .limit(400)
  );
  if (error) {
    console.warn("[references/leads]", error.message);
    return [];
  }
  const canAll = isAdminOrHigher(staff) || isManagerOrHigher(staff);
  const out: Array<{ id: string; label: string }> = [];
  for (const row of data ?? []) {
    if (!canAll) {
      const o = String(row.owner_user_id ?? "") === staff.user_id;
      const c = row.contacts as { owner_user_id?: string | null } | null;
      const co = c && String(c.owner_user_id ?? "") === staff.user_id;
      if (!o && !co) continue;
    }
    const label = labelFromContactEmb((row as { contacts?: unknown }).contacts);
    if (!label || label === "—") continue;
    if (q.length > 0 && !label.toLowerCase().includes(qLower)) continue;
    out.push({ id: String(row.id), label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out.slice(0, 20);
}

async function searchFacilities(staff: StaffProfile, q: string): Promise<Array<{ id: string; label: string }>> {
  const qLower = q.toLowerCase();
  let query = supabaseAdmin
    .from("facilities")
    .select("id, name, city, state, is_active, assigned_rep_user_id")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(400);
  if (!isAdminOrHigher(staff) && !isManagerOrHigher(staff)) {
    query = query.eq("assigned_rep_user_id", staff.user_id);
  }
  const { data, error } = await query;
  if (error) {
    console.warn("[references/facilities]", error.message);
    return [];
  }
  const out: Array<{ id: string; label: string }> = [];
  for (const row of data ?? []) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;
    const city = typeof row.city === "string" ? row.city.trim() : "";
    const label = city ? `${name} — ${city}` : name;
    if (q.length > 0 && !label.toLowerCase().includes(qLower) && !name.toLowerCase().includes(qLower)) continue;
    out.push({ id: String(row.id), label });
  }
  return out.slice(0, 20);
}

async function searchEmployees(staff: StaffProfile, q: string): Promise<Array<{ id: string; label: string }>> {
  const qLower = q.toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email, role, is_active")
    .eq("is_active", true)
    .limit(200);
  if (error) {
    console.warn("[references/employees]", error.message);
    return [];
  }
  const out: Array<{ id: string; label: string }> = [];
  for (const r of data ?? []) {
    if (!isPhoneWorkspaceUser({ role: r.role, is_active: true } as StaffProfile)) continue;
    const label =
      (typeof r.full_name === "string" && r.full_name.trim()) ||
      (typeof r.email === "string" && r.email.trim()) ||
      "Staff";
    if (q.length > 0) {
      const em = (r.email ?? "").toLowerCase();
      if (!label.toLowerCase().includes(qLower) && !em.includes(qLower)) continue;
    }
    out.push({ id: String(r.user_id), label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out.slice(0, 20);
}

function applicantLabel(row: { first_name?: string | null; last_name?: string | null; email?: string | null }): string {
  const f = typeof row.first_name === "string" ? row.first_name.trim() : "";
  const l = typeof row.last_name === "string" ? row.last_name.trim() : "";
  const name = [f, l].filter(Boolean).join(" ").trim();
  if (name) return name;
  const e = typeof row.email === "string" ? row.email.trim() : "";
  return e || "Applicant";
}

async function searchRecruits(staff: StaffProfile, q: string): Promise<Array<{ id: string; label: string }>> {
  if (!canSearchRecruitsInChat(staff)) return [];
  const qLower = q.toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("applicants")
    .select("id, first_name, last_name, email")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.warn("[references/recruits]", error.message);
    return [];
  }
  const out: Array<{ id: string; label: string }> = [];
  for (const row of data ?? []) {
    const label = applicantLabel(row);
    if (q.length > 0 && !label.toLowerCase().includes(qLower)) {
      const em = (typeof row.email === "string" ? row.email : "").toLowerCase();
      if (!em.includes(qLower)) continue;
    }
    out.push({ id: String(row.id), label });
  }
  return out.slice(0, 20);
}

export async function GET(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const type = (req.nextUrl.searchParams.get("type") ?? "").trim() as InternalChatRefKind;
  const q = (req.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  if (!KINDS.includes(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  let items: Array<{ id: string; label: string }> = [];
  if (type === "patient") {
    items = await searchPatients(staff, q);
  } else if (type === "lead") {
    items = await searchLeads(staff, q);
  } else if (type === "facility") {
    items = await searchFacilities(staff, q);
  } else if (type === "employee") {
    items = await searchEmployees(staff, q);
  } else {
    items = await searchRecruits(staff, q);
  }

  return NextResponse.json({ items });
}
