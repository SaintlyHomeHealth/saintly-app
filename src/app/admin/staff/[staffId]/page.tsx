import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { supabaseAdmin } from "@/lib/admin";
import {
  defaultPagesForPreset,
  isStaffPagePreset,
  resolveEffectivePageAccess,
  roleFallbackPreset,
  STAFF_PAGE_KEYS,
  STAFF_PAGE_LABELS,
  STAFF_PAGE_PRESETS,
} from "@/lib/staff-page-access";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import {
  getStaffProfile,
  isAdminOrHigher,
  isSuperAdmin,
  mapStaffRow,
  type StaffRole,
} from "@/lib/staff-profile";

import {
  updateStaffAccessToggles,
  updateStaffPageAccess,
  updateStaffPhonePolicy,
  setPhoneAccess,
  updateStaffSmsNotifyPhone,
} from "../actions";
import { CreateLoginDialog } from "../create-login-dialog";
import { ResendInviteDialog } from "../resend-invite-dialog";
import { EditStaffDialog } from "../edit-staff-dialog";
import { InboundRingGroupsCell } from "../inbound-ring-groups-cell";
import { PayrollStaffLinkDialog } from "../payroll-staff-link-dialog";
import { PermanentDeleteStaffDialog } from "../permanent-delete-staff-dialog";
import { RemoveStaffDialog } from "../remove-staff-dialog";
import { RepairLoginLinkButton } from "../repair-login-link-button";
import { ResetPasswordDialog } from "../reset-password-dialog";
import { StaffCommunicationBar } from "./staff-communication-bar";

function roleLabel(role: StaffRole): string {
  const m: Record<string, string> = {
    super_admin: "Super admin",
    admin: "Admin",
    manager: "Manager",
    nurse: "Nurse",
    don: "DON",
    recruiter: "Recruiter",
    billing: "Billing",
    dispatch: "Dispatch",
    credentialing: "Credentialing",
    read_only: "Read-only",
  };
  return m[role] ?? role;
}

function flashDetailErr(code: string | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    invalid: "Check all fields and try again.",
    forbidden: "You cannot assign that role.",
    load: "Could not load that staff record.",
    update: "Update failed.",
    last_super: "Keep at least one active super admin.",
    duplicate_email: "Another staff row already uses that work email.",
    auth_email: "Supabase Auth rejected the email change (duplicate login email or policy).",
    self_remove: "You cannot remove or permanently delete your own staff row here.",
    permanent_forbidden: "This action could not be completed.",
    permanent_payroll_blocked: "Cannot delete. This staff is linked to payroll. Deactivate instead.",
    permanent_confirm: "Confirmation did not match. Type DELETE or the exact work email from this row.",
    permanent_staff_row: "The staff row could not be removed after Auth was deleted. See details below.",
    permanent_auth: "Supabase could not delete the Auth user. Details below.",
  };
  return m[code] ?? "Something went wrong.";
}

function flashDetailOk(code: string | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    profile: "Identity (name, email, and role if changed) saved.",
    access: "Access toggles saved.",
    pages: "Page permissions saved.",
    phone: "Phone settings saved.",
    ring_groups: "Inbound ring groups saved.",
    sms: "Dispatch SMS number saved.",
    payroll_link: "Payroll employee link saved.",
    payroll_link_clear: "Payroll employee link cleared.",
  };
  return m[code] ?? "Saved.";
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function StatusBadge({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "ok" | "warn" | "neutral";
}) {
  const ring =
    variant === "ok"
      ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
      : variant === "warn"
        ? "border-amber-200 bg-amber-50/90 text-amber-950"
        : "border-slate-200 bg-slate-50/90 text-slate-900";
  return (
    <div className={`rounded-[16px] border px-3 py-2.5 ${ring}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600/90">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug">{value}</p>
    </div>
  );
}

function accessSummaryLabel(profile: { role: StaffRole; page_access_preset: string | null }): string {
  if (profile.page_access_preset === "custom") return "Custom";
  if (profile.role === "nurse") return "Nurse";
  return "Admin";
}

function phoneAssignmentSummary(profile: {
  phone_assignment_mode: string;
  dedicated_outbound_e164: string | null;
  shared_line_e164: string | null;
}): { headline: string; detail: string } {
  const hasDedicated =
    profile.phone_assignment_mode === "dedicated" &&
    typeof profile.dedicated_outbound_e164 === "string" &&
    profile.dedicated_outbound_e164.trim() !== "";
  const hasShared =
    profile.phone_assignment_mode === "shared" &&
    typeof profile.shared_line_e164 === "string" &&
    profile.shared_line_e164.trim() !== "";
  if (hasDedicated) {
    return { headline: "Assigned", detail: `Dedicated ${profile.dedicated_outbound_e164}` };
  }
  if (hasShared) {
    return { headline: "Assigned", detail: `Shared ${profile.shared_line_e164}` };
  }
  return { headline: "Not assigned", detail: "Using organization default line until you set a dedicated or shared number." };
}

function callingProfileShort(profile: { phone_calling_profile: string }): string {
  const p = profile.phone_calling_profile;
  if (p === "inbound_outbound") return "Inbound + outbound";
  if (p === "outbound_only") return "Outbound only";
  if (p === "inbound_disabled") return "Inbound disabled";
  return p.replace(/_/g, " ");
}

export default async function StaffAccessDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ staffId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getStaffProfile();
  if (!viewer || !isAdminOrHigher(viewer)) {
    redirect("/admin");
  }

  const { staffId } = await params;
  const sp = (await searchParams) ?? {};
  const okRaw = sp.ok;
  const okCode = typeof okRaw === "string" ? okRaw : undefined;
  const errRaw = sp.err;
  const errCode = typeof errRaw === "string" ? errRaw : undefined;
  const detailRaw = sp.detail;
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

  const { data: raw, error } = await supabaseAdmin
    .from("staff_profiles")
    .select(
      "id, user_id, email, full_name, role, is_active, phone_access_enabled, inbound_ring_enabled, inbound_ring_primary_group_key, sms_notify_phone, applicant_id, admin_shell_access, page_access_preset, page_permissions, require_password_change, phone_assignment_mode, dedicated_outbound_e164, shared_line_e164, phone_calling_profile, sms_messaging_enabled, voicemail_access_enabled, shared_line_permissions, softphone_mobile_enabled, softphone_web_enabled, push_notifications_enabled, call_recording_enabled"
    )
    .eq("id", staffId)
    .maybeSingle();

  if (error || !raw) {
    redirect("/admin/staff?err=load");
  }

  const profile = mapStaffRow(raw as Record<string, unknown>);
  if (!profile) {
    redirect("/admin/staff?err=load");
  }

  const hasLogin = Boolean(profile.user_id);
  let lastSignIn: string | null = null;
  let authLoginEmail: string | null = null;
  if (hasLogin) {
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
    authLoginEmail = typeof authData?.user?.email === "string" ? authData.user.email : null;
    const li = authData?.user?.last_sign_in_at;
    lastSignIn = typeof li === "string" ? li : null;
  }

  const memberships: string[] = [];
  if (profile.user_id) {
    const { data: memRows } = await supabaseAdmin
      .from("inbound_ring_group_memberships")
      .select("ring_group_key")
      .eq("user_id", profile.user_id)
      .eq("is_enabled", true);
    for (const m of memRows ?? []) {
      if (typeof m.ring_group_key === "string") memberships.push(m.ring_group_key);
    }
  }

  const effective = resolveEffectivePageAccess(profile);
  const presetSelectDefault = isStaffPagePreset(profile.page_access_preset)
    ? profile.page_access_preset
    : roleFallbackPreset(profile.role);
  const baseForBadges = defaultPagesForPreset(presetSelectDefault);

  const applicant = profile.applicant_id
    ? (
        await supabaseAdmin
          .from("applicants")
          .select("id, first_name, last_name, email")
          .eq("id", profile.applicant_id)
          .maybeSingle()
      ).data
    : null;

  let hasContract = false;
  if (profile.applicant_id) {
    const { data: contracts } = await supabaseAdmin
      .from("employee_contracts")
      .select("applicant_id")
      .eq("applicant_id", profile.applicant_id)
      .limit(1);
    hasContract = Boolean(contracts?.length);
  }
  const payrollReady = Boolean(profile.applicant_id) && hasContract;

  let suggestedApplicantId: string | null = null;
  let suggestedName: string | null = null;
  let suggestedEmail: string | null = null;
  if (!profile.applicant_id) {
    const em = normalizeStaffLookupEmail(profile.email);
    if (em) {
      const { data: hit } = await supabaseAdmin
        .from("applicants")
        .select("id, first_name, last_name, email")
        .eq("email", em)
        .maybeSingle();
      if (hit?.id) {
        suggestedApplicantId = hit.id;
        suggestedName = `${hit.first_name ?? ""} ${hit.last_name ?? ""}`.trim() || null;
        suggestedEmail = typeof hit.email === "string" ? hit.email : null;
      }
    }
  }

  const canAssignSuperAdmin = isSuperAdmin(viewer);
  const name =
    (profile.full_name ?? "").trim() || (profile.email ?? "").split("@")[0] || "Staff member";

  const loginUrl =
    (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "") + "/login";

  const phoneAssign = phoneAssignmentSummary(profile);
  const passwordIsTemporary = profile.require_password_change === true;

  const errMsg = flashDetailErr(errCode);
  const okMsg = flashDetailOk(okCode);
  const showPermanentDelete = profile.id !== viewer.id;
  const showIdentityRoleField = profile.role !== "super_admin" || canAssignSuperAdmin;

  return (
    <div className="space-y-6 bg-gradient-to-b from-slate-50/60 via-white to-slate-50/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageHeader
          accent="indigo"
          eyebrow="Administration"
          title={name}
          description={
            <span>
              Staff Access detail —{" "}
              <Link href="/admin/staff" className="font-semibold text-indigo-700 underline">
                Back to directory
              </Link>
            </span>
          }
        />
      </div>

      {errMsg ? (
        <p className="rounded-[16px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900">
          {errMsg}
          {errDetail ? (
            <span className="mt-2 block font-mono text-xs text-rose-800/90">{errDetail}</span>
          ) : null}
        </p>
      ) : null}
      {okMsg ? (
        <p className="rounded-[16px] border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
          {okMsg}
        </p>
      ) : null}

      <section className="rounded-[24px] border border-indigo-100/90 bg-gradient-to-br from-indigo-50/50 via-white to-sky-50/30 p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-indigo-900/80">Status</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Snapshot of login, password, phone line, and app access. Open sections below to change anything.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatusBadge
            label="Login"
            value={hasLogin ? "Created" : "Not created"}
            variant={hasLogin ? "ok" : "warn"}
          />
          <StatusBadge
            label="Password"
            value={!hasLogin ? "—" : passwordIsTemporary ? "Temporary" : "User set"}
            variant={!hasLogin ? "neutral" : passwordIsTemporary ? "warn" : "ok"}
          />
          <StatusBadge
            label="Phone"
            value={phoneAssign.headline}
            variant={phoneAssign.headline === "Assigned" ? "ok" : "neutral"}
          />
          <StatusBadge
            label="Access"
            value={accessSummaryLabel(profile)}
            variant="neutral"
          />
        </div>
        <dl className="mt-4 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-semibold text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">{roleLabel(profile.role)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Phone line detail</dt>
            <dd className="font-medium text-slate-900 [overflow-wrap:anywhere]">{phoneAssign.detail}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Calling</dt>
            <dd className="font-medium text-slate-900">{callingProfileShort(profile)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Phone system access</dt>
            <dd className="font-medium text-slate-900">{profile.phone_access_enabled ? "On" : "Off"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Admin shell (nurses)</dt>
            <dd className="font-medium text-slate-900">
              {profile.role === "nurse" ? (profile.admin_shell_access ? "On" : "Off") : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <Card title="Identity">
        <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <span className="text-xs font-semibold text-slate-500">Full name</span>
            <p className="font-medium text-slate-900">{profile.full_name ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Work email</span>
            <p className="font-medium text-slate-900">{profile.email ?? "—"}</p>
          </div>
          {hasLogin ? (
            <div>
              <span className="text-xs font-semibold text-slate-500">Auth sign-in email</span>
              <p className="font-medium text-slate-900">{authLoginEmail ?? "—"}</p>
            </div>
          ) : null}
          <div>
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <p className="font-medium text-slate-900">{profile.is_active ? "Active" : "Inactive"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Linked employee</span>
            <p className="font-medium text-slate-900">
              {applicant
                ? `${applicant.first_name ?? ""} ${applicant.last_name ?? ""}`.trim() || applicant.id
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditStaffDialog
            staffProfileId={profile.id}
            initialFullName={(profile.full_name ?? "").trim()}
            initialEmail={(profile.email ?? "").trim()}
            triggerLabel="Edit identity"
            hasLogin={hasLogin}
            authLoginEmail={authLoginEmail}
            showRoleField={showIdentityRoleField}
            currentRole={profile.role}
            canAssignSuperAdmin={canAssignSuperAdmin}
          />
          <PayrollStaffLinkDialog
            staffProfileId={profile.id}
            staffEmail={(profile.email ?? "").trim()}
            applicantId={profile.applicant_id}
            linkedName={
              applicant
                ? `${applicant.first_name ?? ""} ${applicant.last_name ?? ""}`.trim() || null
                : null
            }
            linkedEmail={applicant?.email ?? null}
            hasContract={hasContract}
            payrollReady={payrollReady}
            suggestedApplicantId={suggestedApplicantId}
            suggestedName={suggestedName}
            suggestedEmail={suggestedEmail}
          />
        </div>
      </Card>

      <Card title="Login access">
        <p className="text-xs text-slate-600">
          Create a login with email invite or a temporary password. Use the same mobile field as Dispatch / welcome SMS
          so onboarding texts work. Each generated password is shown once — copy it or send from the confirmation step.
        </p>
        <div className="flex flex-wrap gap-2">
          <CreateLoginDialog
            staffProfileId={profile.id}
            disabled={hasLogin}
            initialEmail={profile.email}
            initialSmsNotifyPhone={profile.sms_notify_phone}
          />
          <ResetPasswordDialog
            staffProfileId={profile.id}
            disabled={!hasLogin}
            initialSmsNotifyPhone={profile.sms_notify_phone}
            offerAutomaticDelivery
          />
          <ResetPasswordDialog
            staffProfileId={profile.id}
            disabled={!hasLogin}
            defaultAutoGenerate
            triggerLabel="Regenerate temporary password"
            dialogTitle="Regenerate temporary password"
            initialSmsNotifyPhone={profile.sms_notify_phone}
            offerAutomaticDelivery
          />
          <ResendInviteDialog
            staffProfileId={profile.id}
            disabled={!hasLogin}
            disabledReason="Create a login first to resend the invite email."
            initialEmail={profile.email}
            initialSmsNotifyPhone={profile.sms_notify_phone}
          />
          <RepairLoginLinkButton staffProfileId={profile.id} />
        </div>
        <StaffCommunicationBar staffProfileId={profile.id} loginUrl={loginUrl} />
        <div className="text-xs text-slate-600">
          <p>
            Auth linkage:{" "}
            <span className="font-semibold text-slate-800">{hasLogin ? profile.user_id.slice(0, 8) + "…" : "—"}</span>
          </p>
          {lastSignIn ? (
            <p className="mt-1">
              Last sign-in:{" "}
              <span className="font-semibold text-slate-800">
                {new Date(lastSignIn).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </p>
          ) : (
            <p className="mt-1">Last sign-in: —</p>
          )}
        </div>
        <form action={updateStaffAccessToggles} className="rounded-[16px] border border-slate-100 bg-slate-50/60 p-3">
          <input type="hidden" name="staffProfileId" value={profile.id} />
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              name="requirePasswordChange"
              defaultChecked={profile.require_password_change}
              className="rounded border-slate-300"
            />
            Require password change on next login
          </label>
          {profile.role === "nurse" ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                name="adminShellAccess"
                defaultChecked={profile.admin_shell_access}
                className="rounded border-slate-300"
              />
              Allow Admin (backend) navigation for this nurse
            </label>
          ) : null}
          <button
            type="submit"
            className="mt-3 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Save access toggles
          </button>
        </form>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Supabase stores only a one-way password hash. Temporary passwords are shown once in this UI after
          create/reset; staff must use the forced password screen when “require password change” is on.
        </p>
      </Card>

      <Card title="App & page permissions">
        <form action={updateStaffPageAccess} className="space-y-3">
          <input type="hidden" name="staffProfileId" value={profile.id} />
          <label className="block text-xs font-semibold text-slate-700">
            Preset
            <select
              name="pageAccessPreset"
              defaultValue={presetSelectDefault}
              className="mt-1 w-full max-w-md rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {STAFF_PAGE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-slate-500">
            Checkboxes show effective access. Saving stores only differences from the selected preset (except
            “custom”, which snapshots all keys).
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {STAFF_PAGE_KEYS.map((key) => {
              const on = effective[key];
              return (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-800">
                  <input
                    type="checkbox"
                    name={`access_${key}`}
                    defaultChecked={on}
                    className="rounded border-slate-300"
                  />
                  {STAFF_PAGE_LABELS[key]}
                  {on !== baseForBadges[key] ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                      override
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <button
            type="submit"
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Save page permissions
          </button>
        </form>
      </Card>

      <Card title="Phone permissions">
        <p className="text-xs text-slate-600">
          You can assign numbers and calling rules before a login exists. Inbound ring groups still require a linked
          login (see below).
        </p>
        <form action={setPhoneAccess} className="inline">
          <input type="hidden" name="staffProfileId" value={profile.id} />
          <input type="hidden" name="enabled" value={profile.phone_access_enabled ? "0" : "1"} />
          <button
            type="submit"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              profile.phone_access_enabled
                ? "bg-sky-100 text-sky-900 hover:bg-sky-200"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            Phone access: {profile.phone_access_enabled ? "On" : "Off"}
          </button>
        </form>
        <div className="max-w-lg">
          <InboundRingGroupsCell
            staffProfileId={profile.id}
            userId={profile.user_id}
            selectedGroups={memberships}
            primaryGroup={raw.inbound_ring_primary_group_key as string | null}
          />
        </div>
        <form action={updateStaffSmsNotifyPhone} className="flex max-w-md flex-col gap-2">
          <input type="hidden" name="staffProfileId" value={profile.id} />
          <label className="text-xs font-semibold text-slate-700">
            Dispatch / welcome SMS # (E.164 or US)
            <input
              name="smsNotifyPhone"
              type="tel"
              defaultValue={profile.sms_notify_phone ? formatPhoneNumber(profile.sms_notify_phone) : ""}
              className="mt-1 w-full rounded-[14px] border border-slate-200 px-3 py-2 text-sm"
              placeholder="Mobile for SMS"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
          >
            Save SMS number
          </button>
        </form>
        <form action={updateStaffPhonePolicy} className="space-y-3 rounded-[16px] border border-slate-100 bg-slate-50/50 p-3">
          <input type="hidden" name="staffProfileId" value={profile.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              Number assignment
              <select
                name="phoneAssignmentMode"
                defaultValue={profile.phone_assignment_mode}
                className="mt-1 w-full rounded-[12px] border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="organization_default">Organization default (env lines)</option>
                <option value="dedicated">Dedicated line from pool</option>
                <option value="shared">Shared company line</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Calling profile
              <select
                name="phoneCallingProfile"
                defaultValue={profile.phone_calling_profile}
                className="mt-1 w-full rounded-[12px] border border-slate-200 bg-white px-2 py-1.5 text-sm"
              >
                <option value="inbound_outbound">Inbound + outbound</option>
                <option value="outbound_only">Outbound only</option>
                <option value="inbound_disabled">Inbound disabled</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Dedicated outbound E.164
              <input
                name="dedicatedOutboundE164"
                defaultValue={profile.dedicated_outbound_e164 ?? ""}
                className="mt-1 w-full rounded-[12px] border border-slate-200 px-2 py-1.5 text-sm font-mono"
                placeholder="+1…"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Shared line E.164
              <input
                name="sharedLineE164"
                defaultValue={profile.shared_line_e164 ?? ""}
                className="mt-1 w-full rounded-[12px] border border-slate-200 px-2 py-1.5 text-sm font-mono"
                placeholder="+1…"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-800">
            <label className="flex items-center gap-1">
              <input type="checkbox" name="smsMessagingEnabled" defaultChecked={profile.sms_messaging_enabled} />
              SMS
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="voicemailAccessEnabled"
                defaultChecked={profile.voicemail_access_enabled}
              />
              Voicemail UI
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="softphoneMobileEnabled"
                defaultChecked={profile.softphone_mobile_enabled}
              />
              Mobile softphone
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="softphoneWebEnabled" defaultChecked={profile.softphone_web_enabled} />
              Web softphone
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="pushNotificationsEnabled"
                defaultChecked={profile.push_notifications_enabled}
              />
              Push notifications
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" name="callRecordingEnabled" defaultChecked={profile.call_recording_enabled} />
              Call recording (policy)
            </label>
          </div>
          <div className="border-t border-slate-200 pt-2">
            <p className="text-[11px] font-semibold text-slate-600">Shared line permissions (intent)</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {(
                [
                  ["shared_full_access", "Full access"],
                  ["shared_outbound_only", "Outbound only"],
                  ["shared_receive_voice", "Receive voice"],
                  ["shared_sms", "SMS"],
                  ["shared_voicemail", "Voicemail"],
                  ["shared_call_history", "Call history"],
                ] as const
              ).map(([name, label]) => {
                const permKey = name.replace(/^shared_/, "");
                return (
                  <label key={name} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      name={name}
                      defaultChecked={profile.shared_line_permissions[permKey] === true}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Save phone policy
          </button>
        </form>
      </Card>

      <Card title="Danger zone">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Deactivate</span> turns off this staff row and keeps the
          Supabase login and history intact. <span className="font-semibold text-rose-900">Delete permanently</span>{" "}
          removes the directory row and, when a login exists, deletes the Auth user — use only for mistaken or test
          entries.
        </p>
        <div className="flex flex-wrap gap-2">
          <RemoveStaffDialog staffProfileId={profile.id} hasLogin={hasLogin} label={name} />
          {showPermanentDelete ? <PermanentDeleteStaffDialog staffProfileId={profile.id} /> : null}
        </div>
      </Card>
    </div>
  );
}
