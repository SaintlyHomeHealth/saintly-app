"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeStaffLookupEmail } from "@/lib/admin/staff-auth-shared";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  getStaffProfile,
  isAdminOrHigher,
  isSuperAdmin,
  type StaffRole,
} from "@/lib/staff-profile";

function isStaffRole(value: string): value is StaffRole {
  return (
    value === "super_admin" || value === "admin" || value === "manager" || value === "nurse"
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

export async function setInboundRing(formData: FormData) {
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
    redirect("/admin/staff?err=self_ring");
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ inbound_ring_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.warn("[staff] setInboundRing:", error.message);
    redirect("/admin/staff?err=update");
  }

  await insertAuditLog({
    action: enabled ? "staff.inbound_ring_add" : "staff.inbound_ring_remove",
    entityType: "staff_profiles",
    entityId: id,
    metadata: {},
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff?ok=ring");
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
