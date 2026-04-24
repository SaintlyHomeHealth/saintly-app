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
  /** Same as DB normalize_staff_work_email(email); set when loaded via RPC. */
  normalizedEmail?: string | null;
  charLen?: number | null;
  octetLen?: number | null;
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
  staffLookupSource: "rpc" | "fallback" | "none";
  staffLookupError?: string;
  authUserId: string | null;
  applicants: StaffEmailDiagnosisApplicantRow[];
  contacts: StaffEmailDiagnosisContactRow[];
};

/** Escape `%` and `_` for Postgres ILIKE patterns (emails rarely need this). */
function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

type RpcConflictRow = {
  id: string;
  email: string | null;
  is_active: boolean;
  user_id: string | null;
  full_name: string | null;
  role: string | null;
  normalized_email: string | null;
  char_len: number | null;
  octet_len: number | null;
};

function mapRpcRows(data: RpcConflictRow[]): StaffEmailDiagnosisStaffRow[] {
  return data.map((r) => ({
    id: r.id,
    is_active: r.is_active !== false,
    full_name: r.full_name,
    email: r.email,
    user_id: r.user_id,
    role: r.role,
    normalizedEmail: r.normalized_email,
    charLen: r.char_len,
    octetLen: r.octet_len,
  }));
}

/**
 * Legacy fallback if RPC is missing (migration not applied). May miss trailing space / ZWSP in DB.
 */
async function findStaffProfilesByWorkEmailFallback(
  email: string,
  norm: string
): Promise<StaffEmailDiagnosisStaffRow[]> {
  const pattern = escapeIlikePattern(norm);
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, is_active, full_name, email, user_id, role")
    .or(`email.eq.${norm},email.ilike.${pattern},email.ilike.${`%${pattern}%`}`);

  if (error) {
    console.warn("[staff-email-diagnosis] staff_profiles fallback:", error.message);
    return [];
  }

  const rows = (data ?? []) as StaffEmailDiagnosisStaffRow[];
  const seen = new Set<string>();
  const out: StaffEmailDiagnosisStaffRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    if (normalizeStaffLookupEmail(r.email) === norm) {
      seen.add(r.id);
      out.push({ ...r, normalizedEmail: norm });
    }
  }
  return out;
}

export async function findStaffProfilesByWorkEmailWithSource(email: string): Promise<{
  rows: StaffEmailDiagnosisStaffRow[];
  source: "rpc" | "fallback";
  rpcError?: string;
}> {
  const norm = normalizeStaffLookupEmail(email);
  if (!norm) {
    return { rows: [], source: "fallback" };
  }

  const { data, error } = await supabaseAdmin.rpc("admin_staff_profiles_conflicts_for_email", {
    p_email: email,
  });

  if (!error && data && Array.isArray(data)) {
    return { rows: mapRpcRows(data as RpcConflictRow[]), source: "rpc" };
  }

  if (error && process.env.NODE_ENV === "development") {
    console.warn("[staff-email-diagnosis] rpc admin_staff_profiles_conflicts_for_email:", error.message);
  }

  return {
    rows: await findStaffProfilesByWorkEmailFallback(email, norm),
    source: "fallback",
    rpcError: error?.message,
  };
}

/**
 * All staff_profiles rows where DB normalize_staff_work_email(email) matches
 * normalize_staff_work_email(p_email) — same predicate as the unique index.
 */
export async function findStaffProfilesByWorkEmail(email: string): Promise<StaffEmailDiagnosisStaffRow[]> {
  const { rows } = await findStaffProfilesByWorkEmailWithSource(email);
  return rows;
}

export async function diagnoseWorkEmail(rawEmail: string): Promise<StaffEmailDiagnosis> {
  const trimmedRaw = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const normalizedEmail = normalizeStaffLookupEmail(trimmedRaw);
  if (!normalizedEmail) {
    return {
      normalizedEmail: "",
      staffProfiles: [],
      staffLookupSource: "none",
      authUserId: null,
      applicants: [],
      contacts: [],
    };
  }

  const pattern = escapeIlikePattern(normalizedEmail);
  const pEmail = trimmedRaw || rawEmail;

  const [staffMeta, authUserId, applicantsRes, contactsRes] = await Promise.all([
    findStaffProfilesByWorkEmailWithSource(pEmail),
    findAuthUserIdByEmail(normalizedEmail),
    supabaseAdmin
      .from("applicants")
      .select("id, first_name, last_name, status, email")
      .or(`email.eq.${normalizedEmail},email.ilike.${pattern},email.ilike.${`%${pattern}%`}`)
      .limit(16),
    supabaseAdmin
      .from("contacts")
      .select("id, full_name, email")
      .or(`email.eq.${normalizedEmail},email.ilike.${pattern},email.ilike.${`%${pattern}%`}`)
      .limit(16),
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
    staffProfiles: staffMeta.rows,
    staffLookupSource: staffMeta.source,
    staffLookupError: staffMeta.rpcError,
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
