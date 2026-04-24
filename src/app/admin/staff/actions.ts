"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteOrphanAuthUserForNormalizedEmail,
  findAuthUserIdByEmail,
} from "@/lib/admin/staff-auth-link";
import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  getStaffProfile,
  isAdminOrHigher,
  isSuperAdmin,
  isStaffRole,
  type PhoneAssignmentMode,
  type PhoneCallingProfile,
  type StaffRole,
} from "@/lib/staff-profile";
import { isInboundRingGroupKey, type InboundRingGroupKey } from "@/lib/phone/ring-groups";
import { defaultPagesForPreset, isStaffPagePreset, STAFF_PAGE_KEYS } from "@/lib/staff-page-access";

export async function addStaffProfile(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = normalizeStaffLookupEmail(String(formData.get("email") ?? ""));
  const roleRaw = String(formData.get("role") ?? "").trim();

  if (!fullName || !email || !isStaffRole(roleRaw)) {
    redirect("/admin/staff?err=invalid");
  }
  if (roleRaw === "super_admin" && !isSuperAdmin(actor)) {
    redirect("/admin/staff?err=forbidden");
  }

  const { data: dupRow } = await supabaseAdmin
    .from("staff_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (dupRow?.id) {
    redirect(`/admin/staff?err=duplicate_email_staff&dupId=${encodeURIComponent(dupRow.id)}`);
  }

  const existingAuthId = await findAuthUserIdByEmail(email);
  if (existingAuthId) {
    const { data: linked } = await supabaseAdmin
      .from("staff_profiles")
      .select("id")
      .eq("user_id", existingAuthId)
      .maybeSingle();
    if (linked?.id) {
      redirect(
        `/admin/staff?err=duplicate_email_auth&dupStaffId=${encodeURIComponent(linked.id)}`
      );
    }
    const { error: orphanDelErr } = await supabaseAdmin.auth.admin.deleteUser(existingAuthId);
    if (orphanDelErr) {
      console.warn("[staff] addStaffProfile orphan auth delete:", orphanDelErr.message);
      const safe = encodeURIComponent(orphanDelErr.message.slice(0, 400));
      redirect(`/admin/staff?err=duplicate_email_orphan_auth&detail=${safe}`);
    }
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
  revalidatePath(`/admin/staff/${id}`);
  redirect(`/admin/staff/${id}?ok=phone`);
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
  revalidatePath(`/admin/staff/${id}`);
  redirect(`/admin/staff/${id}?ok=ring_groups`);
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
  revalidatePath(`/admin/staff/${id}`);
  redirect(`/admin/staff/${id}?ok=sms`);
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
  const includeRole = String(formData.get("includeRole") ?? "") === "1";
  const roleRaw = includeRole ? String(formData.get("role") ?? "").trim() : "";

  if (!id || !fullName || !looksLikeWorkEmail(email)) {
    redirect(`/admin/staff/${id}?err=invalid`);
  }

  if (includeRole && !isStaffRole(roleRaw)) {
    redirect(`/admin/staff/${id}?err=invalid`);
  }

  if (includeRole && roleRaw === "super_admin" && !isSuperAdmin(actor)) {
    redirect(`/admin/staff/${id}?err=forbidden`);
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, email, user_id, role")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    redirect(`/admin/staff/${id}?err=load`);
  }

  const currentRole = target.role as StaffRole;
  if (includeRole) {
    if (currentRole === "super_admin" && !isSuperAdmin(actor)) {
      redirect(`/admin/staff/${id}?err=forbidden`);
    }
    if (currentRole === "super_admin" && roleRaw !== "super_admin") {
      const { count, error: cErr } = await supabaseAdmin
        .from("staff_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("is_active", true);

      if (cErr) {
        redirect(`/admin/staff/${id}?err=update`);
      }
      if ((count ?? 0) <= 1) {
        redirect(`/admin/staff/${id}?err=last_super`);
      }
    }
  }

  const { data: dup } = await supabaseAdmin
    .from("staff_profiles")
    .select("id")
    .eq("email", email)
    .neq("id", id)
    .maybeSingle();

  if (dup?.id) {
    redirect(`/admin/staff/${id}?err=duplicate_email`);
  }

  const prevNorm = normalizeStaffLookupEmail(target.email);
  const emailChanged = prevNorm !== email;
  const userId = typeof target.user_id === "string" ? target.user_id : null;
  const roleChanged = includeRole && roleRaw !== currentRole;

  if (userId && emailChanged) {
    const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (aErr) {
      console.warn("[staff] updateStaffProfileIdentity auth email:", aErr.message);
      if (process.env.NODE_ENV === "development") {
        const safe = encodeURIComponent(aErr.message.slice(0, 400));
        redirect(`/admin/staff/${id}?err=auth_email&detail=${safe}`);
      }
      redirect(`/admin/staff/${id}?err=auth_email`);
    }
  }

  const updatePayload: Record<string, unknown> = {
    full_name: fullName,
    email,
    updated_at: new Date().toISOString(),
  };
  if (roleChanged) {
    updatePayload.role = roleRaw;
  }

  const { error: upErr } = await supabaseAdmin.from("staff_profiles").update(updatePayload).eq("id", id);

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
    redirect(`/admin/staff/${id}?err=update`);
  }

  if (roleChanged) {
    await insertAuditLog({
      action: "staff.role_change",
      entityType: "staff_profiles",
      entityId: id,
      metadata: { role: roleRaw, source: "identity_form" },
    });
  }

  await insertAuditLog({
    action: "staff.profile_identity_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { email_changed: emailChanged, role_changed: roleChanged },
  });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  redirect(`/admin/staff/${id}?ok=profile`);
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
  revalidatePath(`/admin/staff/${staffProfileId}`);
  redirect(`/admin/staff/${staffProfileId}?ok=payroll_link`);
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
  revalidatePath(`/admin/staff/${staffProfileId}`);
  redirect(`/admin/staff/${staffProfileId}?ok=payroll_link_clear`);
}

export type StaffListMutationResult = { ok: true } | { ok: false; error: string };

export type StaffListPermanentDeleteResult =
  | { ok: true; resultKind: "placeholder" | "with_login" }
  | {
      ok: false;
      error: string;
      errCode:
        | "payroll"
        | "self"
        | "auth"
        | "load"
        | "constraint"
        | "staff_row"
        | "other";
    };

/**
 * Deactivate a staff row (login kept, access removed). Same server rules as `removeStaffRecord` for users with
 * `user_id` — for the /admin/staff list overflow; returns JSON instead of redirecting.
 */
export async function staffListDeactivateAction(staffProfileId: string): Promise<StaffListMutationResult> {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return { ok: false, error: "Not authorized." };
  }

  const id = String(staffProfileId ?? "").trim();
  if (!id || !isUuid(id)) {
    return { ok: false, error: "Invalid request." };
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, role, is_active")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    return { ok: false, error: "Could not load that staff record." };
  }

  if (target.user_id === actor.user_id) {
    return { ok: false, error: "You cannot deactivate your own staff row here." };
  }

  const userId = typeof target.user_id === "string" ? target.user_id : null;
  if (!userId) {
    return { ok: false, error: "This row has no login. Use Delete permanently to remove a placeholder, or open the profile." };
  }
  if (target.is_active === false) {
    return { ok: true };
  }
  if (target.role === "super_admin") {
    const { count, error: cErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true);

    if (cErr) {
      return { ok: false, error: "Update failed." };
    }
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "Keep at least one active super admin." };
    }
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[staff] staffListDeactivateAction:", error.message);
    return { ok: false, error: "Update failed." };
  }

  await insertAuditLog({
    action: "staff.remove_deactivated",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { had_login: true, source: "staff_list" },
  });

  revalidatePath("/admin/staff");
  return { ok: true };
}

const PAYROLL_DELETE_BLOCKED_MSG =
  "Cannot delete. This staff is linked to payroll. Deactivate instead.";

/**
 * Shared permanent-delete implementation (list, detail, and form wrappers). No typed phrase.
 */
export async function staffListPermanentDeleteAction(staffProfileId: string): Promise<StaffListPermanentDeleteResult> {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return { ok: false, error: "Not authorized.", errCode: "other" };
  }

  const id = String(staffProfileId ?? "").trim();
  if (!id || !isUuid(id)) {
    return { ok: false, error: "Invalid request.", errCode: "other" };
  }

  const { data: target, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("id, user_id, role, applicant_id, email")
    .eq("id", id)
    .maybeSingle();

  if (loadErr || !target) {
    return { ok: false, error: "Could not load that staff record.", errCode: "load" };
  }

  if (target.applicant_id) {
    return { ok: false, error: PAYROLL_DELETE_BLOCKED_MSG, errCode: "payroll" };
  }

  if (target.user_id === actor.user_id) {
    return { ok: false, error: "You can't delete your own staff row.", errCode: "self" };
  }

  const userId = typeof target.user_id === "string" ? target.user_id : null;

  if (!userId) {
    const { error: delErr } = await supabaseAdmin.from("staff_profiles").delete().eq("id", id);
    if (delErr) {
      const msg = delErr.message || "";
      console.warn("[staff] staffListPermanentDeleteAction placeholder:", msg);
      if (/foreign key|constraint|violat/i.test(msg)) {
        return {
          ok: false,
          error:
            "Can't delete permanently because this staff record is still linked elsewhere. Deactivate or clear related links first.",
          errCode: "constraint",
        };
      }
      return { ok: false, error: "Delete failed.", errCode: "other" };
    }
    await insertAuditLog({
      action: "staff.permanent_delete_placeholder",
      entityType: "staff_profiles",
      entityId: id,
      metadata: { source: "staff_list" },
    });
    await deleteOrphanAuthUserForNormalizedEmail(
      typeof target.email === "string" ? target.email : null
    );
    revalidatePath("/admin/staff");
    return { ok: true, resultKind: "placeholder" };
  }

  await supabaseAdmin.from("inbound_ring_group_memberships").delete().eq("user_id", userId);

  const { error: unlinkErr } = await supabaseAdmin
    .from("staff_profiles")
    .update({ user_id: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (unlinkErr) {
    console.warn("[staff] staffListPermanentDeleteAction unlink user_id:", unlinkErr.message);
    return {
      ok: false,
      error: "Delete failed (could not prepare login removal).",
      errCode: "other",
    };
  }

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error("[staff] staffListPermanentDeleteAction auth delete", authErr.message);
    await supabaseAdmin
      .from("staff_profiles")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", id);
    return {
      ok: false,
      error: "Supabase could not delete the login. Open the staff profile to retry or see details.",
      errCode: "auth",
    };
  }

  const { error: delStaffErr } = await supabaseAdmin.from("staff_profiles").delete().eq("id", id);
  if (delStaffErr) {
    const msg = delStaffErr.message || "";
    console.error("[staff] staffListPermanentDeleteAction staff row:", msg);
    if (/foreign key|constraint|violat/i.test(msg)) {
      return {
        ok: false,
        error:
          "Can't delete permanently because this staff record is still linked in the database. Deactivate or clear related links and try again.",
        errCode: "constraint",
      };
    }
    return {
      ok: false,
      error: "The staff row could not be removed after the login was deleted. Open the profile for details.",
      errCode: "staff_row",
    };
  }

  await insertAuditLog({
    action: "staff.permanent_delete",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { auth_user_id: userId, source: "staff_list" },
  });

  await deleteOrphanAuthUserForNormalizedEmail(
    typeof target.email === "string" ? target.email : null
  );

  revalidatePath("/admin/staff");
  return { ok: true, resultKind: "with_login" };
}

/**
 * Client and server call sites: same rules as `staffListPermanentDeleteAction`.
 */
export async function permanentlyDeleteStaffUser(input: { staffId: string }): Promise<StaffListPermanentDeleteResult> {
  return staffListPermanentDeleteAction(input.staffId);
}

/**
 * Form-based entry (redirects on success/error). Prefer `permanentlyDeleteStaffUser` from client code.
 */
export async function permanentlyDeleteStaffUserForm(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  if (!id || !isUuid(id)) {
    redirect(`/admin/staff/${id}?err=invalid`);
  }

  const r = await staffListPermanentDeleteAction(id);
  if (!r.ok) {
    if (r.errCode === "payroll") {
      redirect(`/admin/staff/${id}?err=permanent_payroll_blocked`);
    }
    if (r.errCode === "self") {
      redirect(`/admin/staff/${id}?err=self_remove`);
    }
    if (r.errCode === "load") {
      redirect(`/admin/staff/${id}?err=load`);
    }
    if (r.errCode === "auth") {
      const safe = encodeURIComponent(r.error.slice(0, 400));
      redirect(`/admin/staff/${id}?err=permanent_auth&detail=${safe}`);
    }
    if (r.errCode === "constraint" || r.errCode === "staff_row") {
      const safe = encodeURIComponent(r.error.slice(0, 400));
      redirect(
        r.errCode === "staff_row"
          ? `/admin/staff/${id}?err=permanent_staff_row&detail=${safe}`
          : `/admin/staff/${id}?err=permanent_applicant&detail=${safe}`
      );
    }
    const safe = encodeURIComponent(r.error.slice(0, 400));
    redirect(`/admin/staff/${id}?err=update&detail=${safe}`);
  }

  revalidatePath(`/admin/staff/${id}`);
  if (r.resultKind === "placeholder") {
    redirect("/admin/staff?ok=permanent_deleted_row");
  }
  redirect("/admin/staff?ok=permanent_deleted");
}

function revalidateStaffViews(staffProfileId: string) {
  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffProfileId}`);
}

export async function updateStaffAccessToggles(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  if (!id) redirect("/admin/staff?err=invalid");

  const requirePwd = formData.has("requirePasswordChange");

  const { data: cur } = await supabaseAdmin
    .from("staff_profiles")
    .select("role, admin_shell_access")
    .eq("id", id)
    .maybeSingle();

  let adminShell = cur?.admin_shell_access !== false;
  if (cur?.role === "nurse") {
    adminShell = formData.has("adminShellAccess");
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      admin_shell_access: adminShell,
      require_password_change: requirePwd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.warn("[staff] updateStaffAccessToggles:", error.message);
    redirect(`/admin/staff/${id}?err=update`);
  }

  await insertAuditLog({
    action: "staff.access_toggles_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { admin_shell_access: adminShell, require_password_change: requirePwd },
  });

  revalidateStaffViews(id);
  redirect(`/admin/staff/${id}?ok=access`);
}

export async function updateStaffPageAccess(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  const presetRaw = String(formData.get("pageAccessPreset") ?? "").trim();
  if (!id || !presetRaw) redirect("/admin/staff?err=invalid");

  const preset = isStaffPagePreset(presetRaw) ? presetRaw : "custom";

  const page_permissions: Record<string, boolean> = {};
  if (preset === "custom") {
    for (const key of STAFF_PAGE_KEYS) {
      page_permissions[key] = formData.has(`access_${key}`);
    }
  } else {
    const base = defaultPagesForPreset(preset);
    for (const key of STAFF_PAGE_KEYS) {
      const on = formData.has(`access_${key}`);
      if (on !== base[key]) {
        page_permissions[key] = on;
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      page_access_preset: preset,
      page_permissions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.warn("[staff] updateStaffPageAccess:", error.message);
    redirect(`/admin/staff/${id}?err=update`);
  }

  await insertAuditLog({
    action: "staff.page_access_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { preset, override_count: Object.keys(page_permissions).length },
  });

  revalidateStaffViews(id);
  redirect(`/admin/staff/${id}?ok=pages`);
}

export async function updateStaffPhonePolicy(formData: FormData) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    redirect("/admin");
  }

  const id = String(formData.get("staffProfileId") ?? "").trim();
  if (!id) redirect("/admin/staff?err=invalid");

  const modeRaw = String(formData.get("phoneAssignmentMode") ?? "").trim();
  const phone_assignment_mode: PhoneAssignmentMode =
    modeRaw === "dedicated" || modeRaw === "shared" || modeRaw === "organization_default"
      ? modeRaw
      : "organization_default";

  const dedicatedRaw = String(formData.get("dedicatedOutboundE164") ?? "").trim();
  const sharedRaw = String(formData.get("sharedLineE164") ?? "").trim();

  const callRaw = String(formData.get("phoneCallingProfile") ?? "").trim();
  const phone_calling_profile: PhoneCallingProfile =
    callRaw === "outbound_only" || callRaw === "inbound_disabled" || callRaw === "inbound_outbound"
      ? callRaw
      : "inbound_outbound";

  const sms_messaging_enabled = formData.has("smsMessagingEnabled");
  const voicemail_access_enabled = formData.has("voicemailAccessEnabled");
  const softphone_mobile_enabled = formData.has("softphoneMobileEnabled");
  const softphone_web_enabled = formData.has("softphoneWebEnabled");
  const push_notifications_enabled = formData.has("pushNotificationsEnabled");
  const call_recording_enabled = formData.has("callRecordingEnabled");

  const shared_line_permissions: Record<string, boolean> = {
    full_access: formData.has("shared_full_access"),
    outbound_only: formData.has("shared_outbound_only"),
    receive_voice: formData.has("shared_receive_voice"),
    sms: formData.has("shared_sms"),
    voicemail: formData.has("shared_voicemail"),
    call_history: formData.has("shared_call_history"),
  };

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({
      phone_assignment_mode,
      dedicated_outbound_e164: dedicatedRaw.length > 0 ? dedicatedRaw : null,
      shared_line_e164: sharedRaw.length > 0 ? sharedRaw : null,
      phone_calling_profile,
      sms_messaging_enabled,
      voicemail_access_enabled,
      shared_line_permissions,
      softphone_mobile_enabled,
      softphone_web_enabled,
      push_notifications_enabled,
      call_recording_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.warn("[staff] updateStaffPhonePolicy:", error.message);
    redirect(`/admin/staff/${id}?err=update`);
  }

  await insertAuditLog({
    action: "staff.phone_policy_update",
    entityType: "staff_profiles",
    entityId: id,
    metadata: { phone_assignment_mode, phone_calling_profile },
  });

  revalidateStaffViews(id);
  redirect(`/admin/staff/${id}?ok=phone`);
}
