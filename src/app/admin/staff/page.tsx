import Link from "next/link";
import { redirect } from "next/navigation";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { supabaseAdmin } from "@/lib/admin";
import {
  getStaffProfile,
  isAdminOrHigher,
  isStaffRole,
  isSuperAdmin,
  type StaffRole,
} from "@/lib/staff-profile";

import { CreateLoginDialog } from "./create-login-dialog";
import { EditStaffDialog } from "./edit-staff-dialog";
import { RemoveStaffDialog } from "./remove-staff-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

import { addStaffProfile, setStaffActive, updateStaffRole } from "./actions";

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: StaffRole;
  is_active: boolean;
  user_id: string | null;
  phone_access_enabled: boolean;
  inbound_ring_enabled: boolean;
  inbound_ring_primary_group_key: string | null;
  sms_notify_phone: string | null;
  applicant_id: string | null;
};

type StaffAuthDiagnostics = {
  authUserExists: boolean;
  emailConfirmed: boolean;
  staffLinkOk: boolean;
};

async function loadStaffAuthDiagnostics(rows: StaffRow[]): Promise<Map<string, StaffAuthDiagnostics>> {
  const map = new Map<string, StaffAuthDiagnostics>();
  await Promise.all(
    rows.map(async (row) => {
      if (!row.user_id) {
        map.set(row.id, {
          authUserExists: false,
          emailConfirmed: false,
          staffLinkOk: false,
        });
        return;
      }
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
      if (error || !data?.user) {
        map.set(row.id, {
          authUserExists: false,
          emailConfirmed: false,
          staffLinkOk: false,
        });
        return;
      }
      const u = data.user;
      const confirmed = Boolean(u.email_confirmed_at ?? u.confirmed_at);
      const se = normalizeStaffLookupEmail(row.email);
      const ae = normalizeStaffLookupEmail(u.email ?? null);
      const staffLinkOk = Boolean(u.id === row.user_id && se.length > 0 && se === ae);
      map.set(row.id, {
        authUserExists: true,
        emailConfirmed: confirmed,
        staffLinkOk,
      });
    })
  );
  return map;
}

function roleLabel(role: StaffRole): string {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "nurse") return "Nurse";
  if (role === "don") return "DON";
  if (role === "recruiter") return "Recruiter";
  if (role === "billing") return "Billing";
  if (role === "dispatch") return "Dispatch";
  if (role === "credentialing") return "Credentialing";
  if (role === "read_only") return "Read-only";
  return role;
}

function flashForErr(code: string | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    invalid: "Check all fields and try again.",
    forbidden: "You cannot assign that role.",
    insert: "Could not add staff (duplicate email?).",
    applicant_taken: "That employee is already linked to another staff login.",
    load: "Could not load that staff record.",
    has_login: "This person already has a login.",
    email: "Add a work email before creating a login.",
    auth: "Supabase could not create or invite the user. Check Auth logs and SMTP.",
    link: "Auth user was created but linking to this staff row failed. Resolve in Supabase before retrying.",
    update: "Update failed.",
    self_phone: "You cannot disable phone access for your own account here.",
    self_ring: "You cannot remove yourself from the inbound ring here.",
    self_active: "You cannot deactivate your own account here.",
    last_super: "Keep at least one active super admin.",
    duplicate_email: "Another staff row already uses that work email.",
    auth_email: "Supabase Auth rejected the email change (duplicate login email or policy).",
    self_remove: "You cannot remove or deactivate your own staff row here.",
    permanent_forbidden: "Only a super admin can permanently delete a login.",
    permanent_no_login: "Permanent delete applies to accounts with a Supabase login. Use Remove for placeholders.",
    permanent_auth: "Supabase could not delete the Auth user. Details below.",
    permanent_applicant: "Could not delete the linked employee/applicant record. Details below.",
  };
  return m[code] ?? "Something went wrong.";
}

function flashForOk(code: string | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    added: "Staff row added.",
    login: "Login created and linked.",
    phone: "Phone access updated.",
    ring: "Inbound ring updated.",
    ring_groups: "Inbound ring groups saved.",
    active: "Active status updated.",
    role: "Role updated.",
    sms: "Dispatch SMS number saved.",
    profile: "Name and email updated.",
    removed: "Placeholder staff row removed.",
    deactivated: "Staff deactivated (login preserved).",
    payroll_link: "Payroll employee link saved.",
    payroll_link_clear: "Payroll employee link cleared.",
    permanent_deleted: "User permanently deleted from Auth and related records. Email can be reused.",
  };
  return m[code] ?? "Saved.";
}

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getStaffProfile();
  if (!viewer || !isAdminOrHigher(viewer)) {
    redirect("/admin");
  }

  const { data: rows, error } = await supabaseAdmin
    .from("staff_profiles")
    .select(
      "id, full_name, email, role, is_active, user_id, phone_access_enabled, inbound_ring_enabled, inbound_ring_primary_group_key, sms_notify_phone, applicant_id"
    )
    .order("full_name", { ascending: true });

  if (error) {
    console.warn("[admin/staff] load:", error.message);
  }

  const list = ((rows ?? []) as unknown[]).filter((r) => {
    const o = r as Record<string, unknown>;
    const role = o.role;
    return typeof role === "string" && isStaffRole(role);
  }) as StaffRow[];

  const sp = (await searchParams) ?? {};
  const errRaw = sp.err;
  const okRaw = sp.ok;
  const detailRaw = sp.detail;
  const errCode = typeof errRaw === "string" ? errRaw : undefined;
  const okCode = typeof okRaw === "string" ? okRaw : undefined;
  const errDetail =
    typeof detailRaw === "string" && detailRaw.trim() !== ""
      ? (() => {
          try {
            return decodeURIComponent(detailRaw);
          } catch {
            return detailRaw;
          }
        })()
      : undefined;
  const errMsg = flashForErr(errCode);
  const okMsg = flashForOk(okCode);

  const canAssignSuperAdmin = isSuperAdmin(viewer);

  const authDiagnostics = await loadStaffAuthDiagnostics(list);

  return (
    <div className="space-y-6 bg-gradient-to-b from-slate-50/60 via-white to-slate-50/40 p-6">
      <AdminPageHeader
        accent="indigo"
        eyebrow="Administration"
        title="Staff Access"
        description="Create logins, roles, and phone permissions. Link each login to an employee (applicant) record under Payroll for visit pay — no SQL required. Accounts are provisioned automatically — you never need Supabase user IDs."
      />

      <div className="overflow-hidden rounded-[32px] border border-indigo-100/90 bg-gradient-to-br from-indigo-50/45 via-white to-sky-50/30 shadow-sm">
        <div className="bg-white/40 p-6 sm:p-8">
          {errMsg ? (
            <p className="mb-4 rounded-[16px] border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-900">
              {errMsg}
              {errDetail ? (
                <span className="mt-2 block font-mono text-xs leading-snug text-red-950/90 [overflow-wrap:anywhere]">
                  {errDetail}
                </span>
              ) : null}
            </p>
          ) : null}
          {okMsg ? (
            <p className="mb-4 rounded-[16px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
              {okMsg}
            </p>
          ) : null}

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Add staff (no login yet)</h2>
            <p className="mt-1 text-xs text-slate-600">
              Creates a directory row. Use <span className="font-semibold">Create login</span> to send an invite and
              link Supabase Auth.
            </p>
            <form action={addStaffProfile} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-xs font-semibold text-slate-700">
                Full name
                <input
                  name="fullName"
                  required
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
                  placeholder="Jane Doe"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Work email
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-inner"
                  placeholder="jane@saintly.com"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Role
                <select
                  name="role"
                  required
                  className="mt-1 w-full rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner"
                  defaultValue="manager"
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="don">DON</option>
                  <option value="nurse">Nurse</option>
                  <option value="recruiter">Recruiter</option>
                  <option value="billing">Billing</option>
                  <option value="dispatch">Dispatch</option>
                  <option value="credentialing">Credentialing</option>
                  <option value="read_only">Read-only</option>
                  {canAssignSuperAdmin ? <option value="super_admin">Super admin</option> : null}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Add staff
                </button>
              </div>
            </form>
          </div>

          <p className="mt-4 text-xs text-slate-600">
            Open a staff member for payroll linking, ring groups, page permissions, and full phone policy. This table
            stays lightweight for daily scanning.
          </p>

          <div className="mt-4 overflow-x-auto rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead>
                <tr className="border-b border-indigo-100/80 bg-slate-50/90 text-slate-600">
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Name</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Email</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Role</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Active</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Login</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Phone</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Quick actions</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                      No staff rows yet.
                    </td>
                  </tr>
                ) : (
                  list.map((row) => {
                    const hasLogin = Boolean(row.user_id);
                    const diag = authDiagnostics.get(row.id);
                    const name =
                      (row.full_name ?? "").trim() ||
                      (row.email ?? "").split("@")[0] ||
                      "—";
                    const phoneOk = hasLogin && row.phone_access_enabled;
                    const linkIssue = hasLogin && diag && (!diag.authUserExists || !diag.staffLinkOk || !diag.emailConfirmed);
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <Link
                            href={`/admin/staff/${row.id}`}
                            className="text-indigo-800 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-950"
                          >
                            {name}
                          </Link>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-slate-700">{row.email ?? "—"}</td>
                        <td className="px-4 py-3">
                          {!canAssignSuperAdmin && row.role === "super_admin" ? (
                            <span className="text-xs font-semibold text-slate-800">{roleLabel(row.role)}</span>
                          ) : (
                            <form action={updateStaffRole} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="staffProfileId" value={row.id} />
                              <select
                                name="role"
                                defaultValue={row.role}
                                className="max-w-[130px] rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800"
                              >
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
                                <option value="don">DON</option>
                                <option value="nurse">Nurse</option>
                                <option value="recruiter">Recruiter</option>
                                <option value="billing">Billing</option>
                                <option value="dispatch">Dispatch</option>
                                <option value="credentialing">Credentialing</option>
                                <option value="read_only">Read-only</option>
                                {canAssignSuperAdmin ? <option value="super_admin">Super admin</option> : null}
                              </select>
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                              >
                                Save
                              </button>
                            </form>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <form action={setStaffActive} className="inline">
                            <input type="hidden" name="staffProfileId" value={row.id} />
                            <input type="hidden" name="active" value={row.is_active ? "0" : "1"} />
                            <button
                              type="submit"
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                row.is_active
                                  ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                                  : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                              }`}
                            >
                              {row.is_active ? "Active" : "Inactive"}
                            </button>
                          </form>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {hasLogin ? (
                            <span className={linkIssue ? "font-semibold text-amber-800" : ""}>
                              Linked{linkIssue ? " · check" : ""}
                            </span>
                          ) : (
                            "No"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {!hasLogin ? "—" : phoneOk ? "On" : "Off"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Link
                              href={`/admin/staff/${row.id}`}
                              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                            >
                              Open
                            </Link>
                            {!hasLogin ? <CreateLoginDialog staffProfileId={row.id} /> : null}
                            {hasLogin ? <ResetPasswordDialog staffProfileId={row.id} /> : null}
                            <EditStaffDialog
                              staffProfileId={row.id}
                              initialFullName={(row.full_name ?? "").trim()}
                              initialEmail={(row.email ?? "").trim()}
                            />
                            <RemoveStaffDialog staffProfileId={row.id} hasLogin={hasLogin} label={name} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
