import { redirect } from "next/navigation";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { supabaseAdmin } from "@/lib/admin";
import {
  getStaffProfile,
  isAdminOrHigher,
  isSuperAdmin,
  type StaffRole,
} from "@/lib/staff-profile";

import { CreateLoginDialog } from "./create-login-dialog";
import { RepairLoginLinkButton } from "./repair-login-link-button";
import { ResetPasswordDialog } from "./reset-password-dialog";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

import {
  addStaffProfile,
  setInboundRing,
  setPhoneAccess,
  setStaffActive,
  updateStaffRole,
} from "./actions";

type StaffRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: StaffRole;
  is_active: boolean;
  user_id: string | null;
  phone_access_enabled: boolean;
  inbound_ring_enabled: boolean;
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

function isStaffRole(value: string): value is StaffRole {
  return (
    value === "super_admin" || value === "admin" || value === "manager" || value === "nurse"
  );
}

function roleLabel(role: StaffRole): string {
  if (role === "super_admin") return "Super admin";
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "nurse") return "Nurse";
  return role;
}

function flashForErr(code: string | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    invalid: "Check all fields and try again.",
    forbidden: "You cannot assign that role.",
    insert: "Could not add staff (duplicate email?).",
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
    active: "Active status updated.",
    role: "Role updated.",
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
      "id, full_name, email, role, is_active, user_id, phone_access_enabled, inbound_ring_enabled"
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
        eyebrow="Administration"
        title="Staff Access"
        description="Create logins, roles, and phone permissions. Accounts are provisioned automatically — you never need Supabase user IDs."
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
                  <option value="nurse">Nurse</option>
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

          <div className="mt-6 overflow-x-auto rounded-[24px] border border-slate-200/90 bg-white shadow-sm">
            <table className="w-full min-w-[1280px] text-left text-xs">
              <thead>
                <tr className="border-b border-indigo-100/80 bg-slate-50/90 text-slate-600">
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Name</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Email</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Role</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Active</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Login</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Auth user</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Email OK</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Link OK</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Phone</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Inbound ring</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-center text-sm text-slate-500">
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
                    return (
                      <tr key={row.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-3 font-medium text-slate-900">{name}</td>
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
                                className="max-w-[140px] rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800"
                              >
                                <option value="admin">Admin</option>
                                <option value="manager">Manager</option>
                                <option value="nurse">Nurse</option>
                                {canAssignSuperAdmin ? <option value="super_admin">Super admin</option> : null}
                              </select>
                              <button
                                type="submit"
                                className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                              >
                                Save role
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
                          {hasLogin ? "Yes" : "No"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {!hasLogin ? "—" : diag?.authUserExists ? "Yes" : "No"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {!hasLogin ? "—" : diag?.authUserExists ? (diag.emailConfirmed ? "Yes" : "No") : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                          {!hasLogin ? "No" : diag?.staffLinkOk ? "Yes" : "No"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {hasLogin ? (
                            <form action={setPhoneAccess} className="inline">
                              <input type="hidden" name="staffProfileId" value={row.id} />
                              <input type="hidden" name="enabled" value={row.phone_access_enabled ? "0" : "1"} />
                              <button
                                type="submit"
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  row.phone_access_enabled
                                    ? "bg-sky-100 text-sky-900 hover:bg-sky-200"
                                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                }`}
                              >
                                {row.phone_access_enabled ? "Enabled" : "Disabled"}
                              </button>
                            </form>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {hasLogin ? (
                            <form action={setInboundRing} className="inline">
                              <input type="hidden" name="staffProfileId" value={row.id} />
                              <input type="hidden" name="enabled" value={row.inbound_ring_enabled ? "0" : "1"} />
                              <button
                                type="submit"
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                  row.inbound_ring_enabled
                                    ? "bg-violet-100 text-violet-900 hover:bg-violet-200"
                                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                                }`}
                              >
                                {row.inbound_ring_enabled ? "In group" : "Not in group"}
                              </button>
                            </form>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            {!hasLogin ? <CreateLoginDialog staffProfileId={row.id} /> : null}
                            {hasLogin ? <ResetPasswordDialog staffProfileId={row.id} /> : null}
                            <RepairLoginLinkButton staffProfileId={row.id} />
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
