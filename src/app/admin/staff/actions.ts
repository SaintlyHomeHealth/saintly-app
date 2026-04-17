"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  deleteApplicantRecord,
  removeApplicantFilesFromStorage,
} from "@/lib/admin/permanent-delete-staff-user";
import {
  getStaffProfile,
  isAdminOrHigher,
  isSuperAdmin,
  type StaffRole,
} from "@/lib/staff-profile";
import { isInboundRingGroupKey, type InboundRingGroupKey } from "@/lib/phone/ring-groups";

function isStaffRole(value: string): value is StaffRole {
  return (
    value === "super_admin" ||
    value === "admin" ||
    value === "manager" ||
    value === "nurse" ||
    value === "don"
  );
}

export async function addStaffProfile(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "").trim();

  if (!fullName || !email || !isStaffRole(roleRaw)) {
    redirect("/admin/staff?err=invalid");
  }
  if (roleRaw === "super_admin" && !isSuperAdmin(actor)) {
    redirect("/admin/staff?err=forbidden");
  }

  const { error } = await supabaseAdmin.from("staff_profiles").insert({
    full_name: fullName,
    email,
    role: roleRaw,
    user_id: null,
    is_active: true,
    phone_access_enabled: false,
    inbound_ring_enabled: false,
  });

  if (error) {
    console.warn("[staff] addStaffProfile:", error.message);
    redirect("/admin/staff?err=insert");
  }

  await insertAuditLog({
    action: "staff.add_placeholder",
    entityType: "staff_profiles",
    entityId: email,
    metadata: { role: roleRaw },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=added");
}

export async function setPhoneAccess(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const idRaw = formData.get("staffProfileId");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  const enabled = String(formData.get("enabled") ?? "") === "1";
  if (!id) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: target } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (!enabled && target?.user_id === actor.user_id) {
    redirect("/admin/staff?err=self_phone");
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ phone_access_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[staff] setPhoneAccess:", error.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: enabled ? "staff.phone_enable" : "staff.phone_disable",
    entityType: "staff_profiles",
    entityId: id,
    metadata: {},
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=phone");
}

/**
 * Sets inbound ring group memberships (DB) and syncs `inbound_ring_enabled` + optional primary group key.
 * Env-based ring lists remain fallback when a group has no DB members.
 */
export async function updateInboundRingGroups(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  if (!id) {
    redirect("/admin/staff?err=invalid");
  }

  const rawGroups = formData.getAll("groups");
  const groups: InboundRingGroupKey[] = [];
  const seen = new Set<string>();
  for (const g of rawGroups) {
    const s = typeof g === "string" ? g.trim() : "";
    if (!s || seen.has(s) || !isInboundRingGroupKey(s)) continue;
    seen.add(s);
    groups.push(s);
  }

  const primaryRaw = String(formData.get("primaryGroup") ?? "").trim();
  let primary: InboundRingGroupKey | null = null;
  if (primaryRaw && isInboundRingGroupKey(primaryRaw) && groups.includes(primaryRaw)) {
    primary = primaryRaw;
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    redirect("/admin/staff?err=load");
  }

  const userId = typeof target.user_id === "string" ? target.user_id : null;
  if (!userId) {
    redirect("/admin/staff?err=invalid");
  }

  if (groups.length === 0 && userId === actor.user_id) {
    redirect("/admin/staff?err=self_ring");
  }

  const { error: delErr } = await supabaseAdmin.from("inbound_ring_group_memberships").delete().eq("user_id", userId);

  if (delErr) {
    console.warn("[staff] updateInboundRingGroups delete memberships:", delErr.message);
    redirect("/admin/staff?err=update");
  }

  if (groups.length > 0) {
    const rows = groups.map((ring_group_key) => ({
      user_id: userId,
      ring_group_key,
      is_enabled: true,
    }));
    const { error: insErr } = await supabaseAdmin.from("inbound_ring_group_memberships").insert(rows);
    if (insErr) {
      console.warn("[staff] updateInboundRingGroups insert:", insErr.message);
      redirect("/admin/staff?err=update");
    }
  }

  const enabled = groups.length > 0;
  const { error: upErr } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      inbound_ring_enabled: enabled,
      inbound_ring_primary_group_key: primary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.warn("[staff] updateInboundRingGroups staff_profiles:", upErr.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.inbound_ring_groups_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: {
      groups,
      primary: primary ?? null,
      inbound_ring_enabled: enabled,
    },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=ring_groups");
}

export async function setStaffActive(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const idRaw = formData.get("staffProfileId");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  const active = String(formData.get("active") ?? "") === "1";
  if (!id) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: target } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (!active && target?.user_id === actor.user_id) {
    redirect("/admin/staff?err=self_active");
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[staff] setStaffActive:", error.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: active ? "staff.activate" : "staff.deactivate",
    entityType: "staff_profiles",
    entityId: id,
    metadata: {},
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=active");
}

export async function updateStaffRole(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const idRaw = formData.get("staffProfileId");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  const roleRaw = String(formData.get("role") ?? "").trim();
  if (!id || !isStaffRole(roleRaw)) {
    redirect("/admin/staff?err=invalid");
  }
  if (roleRaw === "super_admin" && !isSuperAdmin(actor)) {
    redirect("/admin/staff?err=forbidden");
  }

  const { data: target } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, role, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    redirect("/admin/staff?err=load");
  }

  if (target.role === "super_admin" && !isSuperAdmin(actor)) {
    redirect("/admin/staff?err=forbidden");
  }

  if (target.role === "super_admin" && roleRaw !== "super_admin") {
    const { count, error: cErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true);

    if (cErr) {
      redirect("/admin/staff?err=update");
    }
    if ((count ?? 0) <= 1) {
      redirect("/admin/staff?err=last_super");
    }
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ role: roleRaw, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[staff] updateStaffRole failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      staffProfileId: id,
      roleRaw,
    });
    if (process.env.NODE_ENV === "development") {
      const safe = encodeURIComponent(
        `${error.code ?? "unknown"}: ${error.message}`.slice(0, 400)
      );
      redirect(`/admin/staff?err=update&detail=${safe}`);
    }
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.role_change",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { role: roleRaw },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=role");
}

export async function updateStaffSmsNotifyPhone(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const idRaw = formData.get("staffProfileId");
  const id = typeof idRaw === "string" ? idRaw.trim() : "";
  const raw = String(formData.get("smsNotifyPhone") ?? "").trim();
  if (!id) {
    redirect("/admin/staff?err=invalid");
  }

  const digits = raw ? normalizePhone(raw) : "";
  const sms_notify_phone = digits.length >= 10 ? digits : null;

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ sms_notify_phone, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[staff] updateStaffSmsNotifyPhone:", error.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.sms_notify_phone_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { has_value: Boolean(sms_notify_phone) },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=sms");
}

function looksLikeWorkEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 3 || v.length > 320) return false;
  const at = v.indexOf("@");
  if (at <= 0 || at === v.length - 1) return false;
  return !v.includes(" ");
}

/**
 * Updates directory name + work email. For rows with a linked Auth user, changing email
 * updates Supabase Auth first so sign-in / repair-login / staff email stay aligned.
 */
export async function updateStaffProfileIdentity(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = normalizeStaffLookupEmail(String(formData.get("email") ?? ""));

  if (!id || !fullName || !looksLikeWorkEmail(email)) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, email, user_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    redirect("/admin/staff?err=load");
  }

  const { data: dup } = await supabaseAdmin
    .from("staff_profiles")
    .select("id")
    .eq("email", email)
    .neq("id", id)
    .maybeSingle();

  if (dup?.id) {
    redirect("/admin/staff?err=duplicate_email");
  }

  const prevNorm = normalizeStaffLookupEmail(target.email);
  const emailChanged = prevNorm !== email;
  const userId = typeof target.user_id === "string" ? target.user_id : null;

  if (userId && emailChanged) {
    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (aErr) {
      console.warn("[staff] updateStaffProfileIdentity auth email:", aErr.message);
      if (process.env.NODE_ENV === "development") {
        const safe = encodeURIComponent(aErr.message.slice(0, 400));
        redirect(`/admin/staff?err=auth_email&detail=${safe}`);
      }
      redirect("/admin/staff?err=auth_email");
    }
  }

  const { error: upErr } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      full_name: fullName,
      email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    console.warn("[staff] updateStaffProfileIdentity:", upErr.message);
    if (userId && emailChanged && prevNorm.length > 0) {
      const { error: revErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: prevNorm,
        email_confirm: true,
      });
      if (revErr) {
        console.warn("[staff] updateStaffProfileIdentity auth revert failed:", revErr.message);
      }
    }
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.profile_identity_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { email_changed: emailChanged },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=profile");
}

/**
 * No-login rows: hard-delete the placeholder. Linked rows: deactivate only (same as losing access;
 * Auth user is left intact so history / FKs on auth.users stay valid).
 */
export async function removeStaffRecord(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  const confirmed = String(formData.get("confirmed") ?? "") === "1";
  if (!id || !confirmed) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, role, is_active")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    redirect("/admin/staff?err=load");
  }

  if (target.user_id === actor.user_id) {
    redirect("/admin/staff?err=self_remove");
  }

  const userId = typeof target.user_id === "string" ? target.user_id : null;

  if (userId) {
    if (target.is_active === false) {
      revalidatePath("/admin/staff");
      redirect("/admin/staff?ok=deactivated");
    }
    if (target.role === "super_admin") {
      const { count, error: cErr } = await supabaseAdmin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("is_active", true);

      if (cErr) {
        redirect("/admin/staff?err=update");
      }
      if ((count ?? 0) <= 1) {
        redirect("/admin/staff?err=last_super");
      }
    }

    const { error } = await supabaseAdmin
      .from("staff_profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.warn("[staff] removeStaffRecord deactivate:", error.message);
      redirect("/admin/staff?err=update");
    }

    await insertAuditLog({
      action: "staff.remove_deactivated",
      entityType: "staff_profiles",
      entityId: id,
      metadata: { had_login: true },
    });

    revalidatePath("/admin/staff");
    redirect("/admin/staff?ok=deactivated");
  }

  const { error: delErr } = await supabaseAdmin.from("staff_profiles").delete().eq("id", id);

  if (delErr) {
    console.warn("[staff] removeStaffRecord delete:", delErr.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.placeholder_deleted",
    entityType: "staff_profiles",
    entityId: id,
    metadata: {},
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=removed");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Links staff_profiles.applicant_id to an applicants row (payroll / workspace employee record).
 */
export async function setStaffApplicantLink(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const staffProfileId = String(formData.get("staffProfileId") ?? "").trim();
  const applicantId = String(formData.get("applicantId") ?? "").trim();

  if (!staffProfileId || !applicantId || !isUuid(applicantId)) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: applicant, error: apErr } = await supabaseAdmin
    .from("applicants")
    .select("id")
    .eq("id", applicantId)
    .maybeSingle();

  if (apErr || !applicant?.id) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: conflict } = await supabaseAdmin
    .from("staff_profiles")
    .select("id")
    .eq("applicant_id", applicantId)
    .neq("id", staffProfileId)
    .maybeSingle();

  if (conflict?.id) {
    redirect("/admin/staff?err=applicant_taken");
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ applicant_id: applicantId, updated_at: new Date().toISOString() })
    .eq("id", staffProfileId);

  if (error) {
    console.warn("[staff] setStaffApplicantLink:", error.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.applicant_link_set",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { applicant_id: applicantId },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=payroll_link");
}

export async function clearStaffApplicantLink(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const staffProfileId = String(formData.get("staffProfileId") ?? "").trim();
  if (!staffProfileId) {
    redirect("/admin/staff?err=invalid");
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ applicant_id: null, updated_at: new Date().toISOString() })
    .eq("id", staffProfileId);

  if (error) {
    console.warn("[staff] clearStaffApplicantLink:", error.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: "staff.applicant_link_clear",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: {},
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=payroll_link_clear");
}

/**
 * Super-admin only: removes Supabase Auth user and linked applicant/onboarding data so the email can be reused.
 * Keeps separate from {@link removeStaffRecord} (archive/deactivate).
 */
export async function permanentlyDeleteStaffUser(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isSuperAdmin(actor)) {
    redirect("/admin/staff?err=permanent_forbidden");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  const confirmed = String(formData.get("confirmed") ?? "") === "1";
  if (!id || !confirmed) {
    redirect("/admin/staff?err=invalid");
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, role, applicant_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    redirect("/admin/staff?err=load");
  }

  const userId = typeof target.user_id === "string" ? target.user_id : null;
  if (!userId) {
    redirect("/admin/staff?err=permanent_no_login");
  }

  if (userId === actor.user_id) {
    redirect("/admin/staff?err=self_remove");
  }

  if (target.role === "super_admin") {
    const { count, error: cErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true);

    if (cErr) {
      redirect("/admin/staff?err=update");
    }
    if ((count ?? 0) <= 1) {
      redirect("/admin/staff?err=last_super");
    }
  }

  const applicantId = typeof target.applicant_id === "string" ? target.applicant_id : null;
  const storageMeta: { paths: number; errors: string[] } = { paths: 0, errors: [] };

  if (applicantId) {
    const { storagePathsAttempted, storageErrors } = await removeApplicantFilesFromStorage(applicantId);
    storageMeta.paths = storagePathsAttempted;
    storageMeta.errors = storageErrors;

    const { ok, error: applicantDelErr } = await deleteApplicantRecord(applicantId);
    if (!ok) {
      console.error("[staff] permanentlyDeleteStaffUser applicant delete failed", applicantDelErr);
      const safe = encodeURIComponent((applicantDelErr || "unknown").slice(0, 400));
      redirect(`/admin/staff?err=permanent_applicant&detail=${safe}`);
    }
  }

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("[staff] permanentlyDeleteStaffUser auth delete failed", authErr.message);
    const safe = encodeURIComponent(authErr.message.slice(0, 400));
    redirect(`/admin/staff?err=permanent_auth&detail=${safe}`);
  }

  await insertAuditLog({
    action: "staff.permanent_delete",
    entityType: "staff_profiles",
    entityId: id,
    metadata: {
      auth_user_id: userId,
      applicant_id: applicantId,
      storage_paths_attempted: storageMeta.paths,
      storage_cleanup_errors: storageMeta.errors.length ? storageMeta.errors : undefined,
    },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=permanent_deleted");
}
