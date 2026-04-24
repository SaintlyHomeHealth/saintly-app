import "server-only";

import { findAuthUserIdByEmail } from "@/lib/admin/staff-auth-link";
import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { supabaseAdmin } from "@/lib/admin";

export type StaffEmailDiagnosisStaffRow = {
  id: string;
  is_active: boolean;
  full_name: string | null;
  email: string | null;
  user_id: string | null;
  role: string | null;
};

export type StaffEmailDiagnosisApplicantRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
  email: string | null;
};

export type StaffEmailDiagnosisContactRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type StaffEmailDiagnosis = {
  normalizedEmail: string;
  staffProfiles: StaffEmailDiagnosisStaffRow[];
  authUserId: string | null;
  applicants: StaffEmailDiagnosisApplicantRow[];
  contacts: StaffEmailDiagnosisContactRow[];
};

/** Escape `%` and `_` for Postgres ILIKE patterns (emails rarely need this). */
function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Case-insensitive work-email lookup on staff_profiles (fixes missed duplicates when legacy rows
 * stored mixed-case email while the add form normalizes to lowercase).
 */
export async function findStaffProfilesByWorkEmail(email: string): Promise<StaffEmailDiagnosisStaffRow[]> {
  const norm = normalizeStaffLookupEmail(email);
  if (!norm) return [];
  const pattern = escapeIlikePattern(norm);
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, is_active, full_name, email, user_id, role")
    .ilike("email", pattern);

  if (error) {
    console.warn("[staff-email-diagnosis] staff_profiles:", error.message);
    return [];
  }

  const rows = (data ?? []) as StaffEmailDiagnosisStaffRow[];
  return rows.filter((r) => normalizeStaffLookupEmail(r.email) === norm);
}

export async function diagnoseWorkEmail(rawEmail: string): Promise<StaffEmailDiagnosis> {
  const normalizedEmail = normalizeStaffLookupEmail(rawEmail);
  if (!normalizedEmail) {
    return {
      normalizedEmail: "",
      staffProfiles: [],
      authUserId: null,
      applicants: [],
      contacts: [],
    };
  }

  const pattern = escapeIlikePattern(normalizedEmail);

  const [staffProfiles, authUserId, applicantsRes, contactsRes] = await Promise.all([
    findStaffProfilesByWorkEmail(normalizedEmail),
    findAuthUserIdByEmail(normalizedEmail),
    supabaseAdmin
      .from("applicants")
      .select("id, first_name, last_name, status, email")
      .ilike("email", pattern)
      .limit(8),
    supabaseAdmin.from("contacts").select("id, full_name, email").ilike("email", pattern).limit(8),
  ]);

  const applicants = ((applicantsRes.data ?? []) as StaffEmailDiagnosisApplicantRow[]).filter(
    (r) => normalizeStaffLookupEmail(r.email) === normalizedEmail
  );
  const contacts = ((contactsRes.data ?? []) as StaffEmailDiagnosisContactRow[]).filter(
    (r) => normalizeStaffLookupEmail(r.email) === normalizedEmail
  );

  if (applicantsRes.error && process.env.NODE_ENV === "development") {
    console.warn("[staff-email-diagnosis] applicants:", applicantsRes.error.message);
  }
  if (contactsRes.error && process.env.NODE_ENV === "development") {
    console.warn("[staff-email-diagnosis] contacts:", contactsRes.error.message);
  }

  return {
    normalizedEmail,
    staffProfiles,
    authUserId,
    applicants,
    contacts,
  };
}

export function isPostgresUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = String(err.message ?? "");
  return /duplicate key|unique constraint/i.test(m);
}
