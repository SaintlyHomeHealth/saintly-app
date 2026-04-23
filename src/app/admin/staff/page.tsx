import Link from "next/link";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import {
  getStaffProfile,
  isAdminOrHigher,
  isStaffRole,
  isSuperAdmin,
  type StaffRole,
} from "@/lib/staff-profile";

import { StaffDirectoryRowActions } from "./staff-directory-row-actions";

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
  phone_assignment_mode: string | null;
  dedicated_outbound_e164: string | null;
  shared_line_e164: string | null;
  phone_calling_profile: string | null;
};

function phoneSummary(row: StaffRow): string {
  const prof = row.phone_calling_profile ?? "";
  const short =
    prof === "inbound_outbound" ? "In+Out" : prof === "outbound_only" ? "Out only" : prof ? "In off" : "—";
  let line = "Default";
  if (row.phone_assignment_mode === "dedicated" && row.dedicated_outbound_e164) {
    line = row.dedicated_outbound_e164;
  } else if (row.phone_assignment_mode === "shared" && row.shared_line_e164) {
    line = `Shared ${row.shared_line_e164}`;
  }
  const tail = line.length > 14 ? `…${line.slice(-10)}` : line;
  return `${short} · ${tail}`;
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
    permanent_forbidden: "Only a super admin can permanently delete a staff row that has a login.",
    permanent_payroll_blocked:
      "Permanent delete is blocked while a payroll employee is linked. Clear the employee link on this staff row first, then try again — or use Deactivate.",
    permanent_confirm: "Confirmation did not match. Type DELETE or the exact work email from this row.",
    permanent_staff_row: "The staff row could not be removed after Auth was deleted. Details below. Fix in Supabase if needed.",
    permanent_auth: "Supabase could not delete the Auth user. Details below.",
    permanent_applicant: "Could not complete delete due to a linked employee record constraint. Clear the payroll link first.",
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
    permanent_deleted: "Staff row and Supabase login removed. Email can be reused for a new user.",
    permanent_deleted_row: "Placeholder staff row removed (no login was attached).",
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
      "id, full_name, email, role, is_active, user_id, phone_access_enabled, inbound_ring_enabled, inbound_ring_primary_group_key, sms_notify_phone, applicant_id, phone_assignment_mode, dedicated_outbound_e164, shared_line_e164, phone_calling_profile"
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
  const viewerIsSuperAdmin = canAssignSuperAdmin;
  const viewerStaffProfileId = viewer.id;

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
            Open a staff profile for payroll linking, ring groups, page permissions, full phone policy, and Auth email
            sync checks. This list avoids per-row Auth lookups so it stays fast to scan.
          </p>

          <div className="mt-4 overflow-x-auto rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full max-w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-indigo-100/80 bg-slate-50/90 text-slate-600">
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Name</th>
                  <th className="hidden md:table-cell whitespace-nowrap px-3 py-3 font-semibold">Email</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Role</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Active</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Login</th>
                  <th className="hidden lg:table-cell whitespace-nowrap px-3 py-3 font-semibold">Phone</th>
                  <th className="sticky right-0 z-20 min-w-[9rem] max-w-[18rem] whitespace-normal border-l border-slate-200/80 bg-slate-50 px-3 py-3 pl-3 text-right font-semibold shadow-[inset_6px_0_8px_-8px_rgba(15,23,42,0.08)]">
                    Actions
                  </th>
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
                    const name =
                      (row.full_name ?? "").trim() ||
                      (row.email ?? "").split("@")[0] ||
                      "—";
                    const phoneOk = row.phone_access_enabled;
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="max-w-[9rem] px-3 py-3 font-medium text-slate-900 sm:max-w-[11rem]">
                          <Link
                            href={`/admin/staff/${row.id}`}
                            className="block truncate text-indigo-800 underline decoration-indigo-200 underline-offset-2 hover:text-indigo-950"
                            title={name}
                          >
                            {name}
                          </Link>
                          <p className="mt-0.5 truncate text-[10px] text-slate-500 md:hidden" title={row.email ?? ""}>
                            {row.email ?? "—"}
                          </p>
                        </td>
                        <td className="hidden max-w-[10rem] truncate px-3 py-3 text-slate-700 md:table-cell">
                          {row.email ?? "—"}
                        </td>
                        <td className="px-3 py-3">
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
                        <td className="px-3 py-3">
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
                        <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                          {hasLogin ? "Yes" : "No"}
                        </td>
                        <td
                          className="hidden whitespace-nowrap px-3 py-3 text-slate-700 lg:table-cell"
                          title={phoneSummary(row)}
                        >
                          <span className="block max-w-[8.5rem] truncate text-[10px] font-medium leading-tight">
                            {phoneSummary(row)}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-slate-500">
                            {phoneOk ? "Access on" : "Access off"}
                          </span>
                        </td>
                        <td className="sticky right-0 z-10 min-w-[9rem] max-w-[20rem] border-l border-slate-200/80 bg-white px-2 py-2 align-middle text-right shadow-[inset_6px_0_8px_-8px_rgba(15,23,42,0.06)]">
                          <StaffDirectoryRowActions
                            staffProfileId={row.id}
                            hasLogin={hasLogin}
                            isActive={row.is_active}
                            applicantId={row.applicant_id}
                            viewerStaffProfileId={viewerStaffProfileId}
                            viewerIsSuperAdmin={viewerIsSuperAdmin}
                            initialFullName={(row.full_name ?? "").trim()}
                            initialEmail={(row.email ?? "").trim()}
                            initialSmsNotifyPhone={row.sms_notify_phone}
                          />
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
