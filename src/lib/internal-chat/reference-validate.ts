import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { assertStaffAssignedToAllPatients } from "@/lib/internal-chat/assigned-patients";
import type { InternalChatRefKind } from "@/lib/internal-chat/internal-chat-ref-kinds";
import { isAdminOrHigher, isManagerOrHigher, isPhoneWorkspaceUser, type StaffProfile } from "@/lib/staff-profile";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import type { StaffForPageAccess } from "@/lib/staff-page-access";
import { resolveEffectivePageAccess } from "@/lib/staff-page-access";

export function canSearchRecruitsInChat(staff: StaffProfile): boolean {
  if (isAdminOrHigher(staff)) return true;
  if (staff.role === "recruiter") return true;
  const access = resolveEffectivePageAccess(staff as StaffForPageAccess);
  return access.recruiting === true;
}

export async function assertPatientIdsPostable(staff: StaffProfile, patientIds: string[]): Promise<boolean> {
  if (patientIds.length === 0) return true;
  if (isAdminOrHigher(staff)) {
    const { data, error } = await supabaseAdmin
      .from("patients")
      .select("id, patient_status, archived_at, is_test")
      .in("id", patientIds);
    if (error) return false;
    const ok = (data ?? []).filter(
      (r) =>
        String(r.patient_status ?? "") === "active" &&
        !r.archived_at &&
        (r as { is_test?: boolean | null }).is_test !== true
    );
    return ok.length === patientIds.length;
  }
  return assertStaffAssignedToAllPatients(staff.user_id, patientIds);
}

export async function assertLeadIdsPostable(staff: StaffProfile, leadIds: string[]): Promise<boolean> {
  if (leadIds.length === 0) return true;
  const { data, error } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select("id, owner_user_id, contact_id, contacts ( owner_user_id, full_name, first_name, last_name )")
      .in("id", leadIds)
  );
  if (error || !data || data.length !== leadIds.length) return false;
  if (isAdminOrHigher(staff) || isManagerOrHigher(staff)) return true;
  for (const row of data) {
    const own = String(row.owner_user_id ?? "") === staff.user_id;
    const c = row.contacts as { owner_user_id?: string | null } | null;
    const cOwn = c && String(c.owner_user_id ?? "") === staff.user_id;
    if (!own && !cOwn) return false;
  }
  return true;
}

export async function assertFacilityIdsPostable(staff: StaffProfile, facilityIds: string[]): Promise<boolean> {
  if (facilityIds.length === 0) return true;
  const { data, error } = await supabaseAdmin
    .from("facilities")
    .select("id, assigned_rep_user_id, is_active")
    .in("id", facilityIds);
  if (error || !data || data.length !== facilityIds.length) return false;
  if (isAdminOrHigher(staff) || isManagerOrHigher(staff)) {
    return data.every((r) => r.is_active !== false);
  }
  return data.every((r) => r.is_active !== false && String(r.assigned_rep_user_id ?? "") === staff.user_id);
}

export async function assertEmployeeUserIdsPostable(staff: StaffProfile, userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) return true;
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role, is_active")
    .in("user_id", userIds);
  if (error || !data || data.length !== userIds.length) return false;
  for (const r of data) {
    if (!isPhoneWorkspaceUser({ role: r.role, is_active: r.is_active } as StaffProfile)) {
      return false;
    }
  }
  return true;
}

export async function assertRecruitApplicantIdsPostable(staff: StaffProfile, applicantIds: string[]): Promise<boolean> {
  if (applicantIds.length === 0) return true;
  if (!canSearchRecruitsInChat(staff)) return false;
  const { data, error } = await supabaseAdmin.from("applicants").select("id").in("id", applicantIds);
  if (error || !data || data.length !== applicantIds.length) return false;
  return true;
}

export type ResolvedRefCard = {
  kind: InternalChatRefKind;
  id: string;
  label: string;
  href: string | null;
};

export function buildHrefForReference(
  kind: InternalChatRefKind,
  id: string,
  staff: StaffProfile,
  staffRowId: string | null
): string | null {
  const access = resolveEffectivePageAccess(staff);
  switch (kind) {
    case "patient":
      if (access.workspace_patients !== true) return null;
      return `/workspace/phone/patients/${id}`;
    case "lead":
      if (access.leads !== true && access.workspace_leads !== true) return null;
      return `/admin/crm/leads/${id}`;
    case "facility":
      if (access.facilities !== true) return null;
      return `/admin/facilities/${id}`;
    case "employee":
      if (access.employees !== true && !isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
        return null;
      }
      return staffRowId ? `/admin/staff/${staffRowId}` : null;
    case "recruit":
      if (!canSearchRecruitsInChat(staff)) return null;
      return `/admin/employees/${id}`;
    default:
      return null;
  }
}

/** Resolve many employee user_ids to staff_profile ids for /admin/staff links. */
export async function mapUserIdsToStaffRowIds(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabaseAdmin.from("staff_profiles").select("id, user_id").in("user_id", userIds);
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    m.set(String(r.user_id), String(r.id));
  }
  return m;
}
