"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isValidFacilityActivityOutcome,
  isValidFacilityActivityType,
  isValidFacilityPriority,
  isValidFacilityStatus,
  isValidFacilityType,
} from "@/lib/crm/facility-options";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optStr(formData: FormData, key: string): string | null {
  const s = str(formData, key);
  return s ? s : null;
}

function readBool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "1" || v === "on" || v === "true";
}

function parseIsoDatetime(raw: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function requireManager() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }
  return staff;
}

export async function createFacility(formData: FormData) {
  await requireManager();

  const name = str(formData, "name");
  if (!name) {
    redirect("/admin/facilities/new?error=missing_name");
  }

  const typeRaw = str(formData, "type");
  const type = typeRaw && isValidFacilityType(typeRaw) ? typeRaw : null;

  const statusRaw = str(formData, "status");
  const status =
    statusRaw && isValidFacilityStatus(statusRaw) ? statusRaw : "New";

  const priorityRaw = str(formData, "priority");
  const priority =
    priorityRaw && isValidFacilityPriority(priorityRaw) ? priorityRaw : "Medium";

  const assignedRaw = str(formData, "assigned_rep_user_id");
  const assigned_rep_user_id =
    assignedRaw && /^[0-9a-f-]{36}$/i.test(assignedRaw) ? assignedRaw : null;

  const next_follow_up_at = parseIsoDatetime(str(formData, "next_follow_up_at"));

  const { data, error } = await supabaseAdmin
    .from("facilities")
    .insert({
      name,
      type,
      status,
      priority,
      address_line_1: optStr(formData, "address_line_1"),
      address_line_2: optStr(formData, "address_line_2"),
      city: optStr(formData, "city"),
      state: optStr(formData, "state"),
      zip: optStr(formData, "zip"),
      main_phone: optStr(formData, "main_phone"),
      fax: optStr(formData, "fax"),
      email: optStr(formData, "email"),
      website: optStr(formData, "website"),
      territory: optStr(formData, "territory"),
      assigned_rep_user_id,
      referral_method: optStr(formData, "referral_method"),
      referral_notes: optStr(formData, "referral_notes"),
      intake_notes: optStr(formData, "intake_notes"),
      best_time_to_visit: optStr(formData, "best_time_to_visit"),
      next_follow_up_at,
      general_notes: optStr(formData, "general_notes"),
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[facilities] createFacility:", error?.message);
    redirect("/admin/facilities/new?error=save_failed");
  }

  revalidatePath("/admin/facilities");
  redirect(`/admin/facilities/${data.id}`);
}

export async function updateFacility(formData: FormData) {
  await requireManager();

  const id = str(formData, "id");
  if (!id) {
    redirect("/admin/facilities");
  }

  const name = str(formData, "name");
  if (!name) {
    redirect(`/admin/facilities/${id}/edit?error=missing_name`);
  }

  const typeRaw = str(formData, "type");
  const type = typeRaw && isValidFacilityType(typeRaw) ? typeRaw : null;

  const statusRaw = str(formData, "status");
  const status =
    statusRaw && isValidFacilityStatus(statusRaw) ? statusRaw : "New";

  const priorityRaw = str(formData, "priority");
  const priority =
    priorityRaw && isValidFacilityPriority(priorityRaw) ? priorityRaw : "Medium";

  const assignedRaw = str(formData, "assigned_rep_user_id");
  const assigned_rep_user_id =
    assignedRaw && /^[0-9a-f-]{36}$/i.test(assignedRaw) ? assignedRaw : null;

  const last_visit_at = parseIsoDatetime(str(formData, "last_visit_at"));
  const next_follow_up_at = parseIsoDatetime(str(formData, "next_follow_up_at"));

  const { error } = await supabaseAdmin
    .from("facilities")
    .update({
      name,
      type,
      status,
      priority,
      address_line_1: optStr(formData, "address_line_1"),
      address_line_2: optStr(formData, "address_line_2"),
      city: optStr(formData, "city"),
      state: optStr(formData, "state"),
      zip: optStr(formData, "zip"),
      main_phone: optStr(formData, "main_phone"),
      fax: optStr(formData, "fax"),
      email: optStr(formData, "email"),
      website: optStr(formData, "website"),
      territory: optStr(formData, "territory"),
      assigned_rep_user_id,
      referral_method: optStr(formData, "referral_method"),
      referral_notes: optStr(formData, "referral_notes"),
      intake_notes: optStr(formData, "intake_notes"),
      best_time_to_visit: optStr(formData, "best_time_to_visit"),
      last_visit_at,
      next_follow_up_at,
      general_notes: optStr(formData, "general_notes"),
      is_active: str(formData, "is_active") === "1",
    })
    .eq("id", id);

  if (error) {
    console.warn("[facilities] updateFacility:", error.message);
    redirect(`/admin/facilities/${id}/edit?error=save_failed`);
  }

  revalidatePath("/admin/facilities");
  revalidatePath(`/admin/facilities/${id}`);
  redirect(`/admin/facilities/${id}`);
}

function computeFullName(first: string, last: string, full: string): string | null {
  const f = full.trim();
  if (f) return f;
  const parts = [first.trim(), last.trim()].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export async function upsertFacilityContact(formData: FormData) {
  await requireManager();

  const facility_id = str(formData, "facility_id");
  if (!facility_id) {
    redirect("/admin/facilities");
  }

  const contact_id = str(formData, "contact_id");

  const first_name = optStr(formData, "first_name");
  const last_name = optStr(formData, "last_name");
  const full_name_in = str(formData, "full_name");
  const full_name = computeFullName(first_name ?? "", last_name ?? "", full_name_in);

  const row = {
    facility_id,
    first_name,
    last_name,
    full_name,
    title: optStr(formData, "title"),
    department: optStr(formData, "department"),
    direct_phone: optStr(formData, "direct_phone"),
    mobile_phone: optStr(formData, "mobile_phone"),
    fax: optStr(formData, "fax"),
    email: optStr(formData, "email"),
    preferred_contact_method: optStr(formData, "preferred_contact_method"),
    best_time_to_reach: optStr(formData, "best_time_to_reach"),
    is_decision_maker: readBool(formData, "is_decision_maker"),
    influence_level: optStr(formData, "influence_level"),
    notes: optStr(formData, "notes"),
    is_active: !readBool(formData, "deactivate"),
  };

  if (contact_id) {
    const { error } = await supabaseAdmin.from("facility_contacts").update(row).eq("id", contact_id);
    if (error) {
      console.warn("[facilities] update contact:", error.message);
      redirect(`/admin/facilities/${facility_id}?contactError=1`);
    }
  } else {
    const { error } = await supabaseAdmin.from("facility_contacts").insert(row);
    if (error) {
      console.warn("[facilities] insert contact:", error.message);
      redirect(`/admin/facilities/${facility_id}?contactError=1`);
    }
  }

  revalidatePath("/admin/facilities");
  revalidatePath(`/admin/facilities/${facility_id}`);
  redirect(`/admin/facilities/${facility_id}`);
}

export async function createFacilityActivity(formData: FormData) {
  await requireManager();
  const user = await getAuthenticatedUser();

  const facility_id = str(formData, "facility_id");
  if (!facility_id) {
    redirect("/admin/facilities");
  }

  const activity_type = str(formData, "activity_type");
  if (!activity_type || !isValidFacilityActivityType(activity_type)) {
    redirect(`/admin/facilities/${facility_id}?visitError=type`);
  }

  const outcomeRaw = str(formData, "outcome");
  const outcome =
    outcomeRaw && isValidFacilityActivityOutcome(outcomeRaw) ? outcomeRaw : null;

  const facility_contact_id_raw = str(formData, "facility_contact_id");
  const facility_contact_id =
    facility_contact_id_raw && /^[0-9a-f-]{36}$/i.test(facility_contact_id_raw)
      ? facility_contact_id_raw
      : null;

  const activity_at = parseIsoDatetime(str(formData, "activity_at")) ?? new Date().toISOString();
  const next_follow_up_at = parseIsoDatetime(str(formData, "next_follow_up_at"));

  const { error } = await supabaseAdmin.from("facility_activities").insert({
    facility_id,
    facility_contact_id,
    staff_user_id: user?.id ?? null,
    activity_type,
    outcome,
    activity_at,
    notes: optStr(formData, "notes"),
    next_follow_up_at,
    follow_up_task: optStr(formData, "follow_up_task"),
    referral_potential: optStr(formData, "referral_potential"),
    materials_dropped_off: readBool(formData, "materials_dropped_off"),
    got_business_card: readBool(formData, "got_business_card"),
    requested_packet: readBool(formData, "requested_packet"),
    referral_process_captured: readBool(formData, "referral_process_captured"),
  });

  if (error) {
    console.warn("[facilities] createFacilityActivity:", error.message);
    redirect(`/admin/facilities/${facility_id}?visitError=save`);
  }

  revalidatePath("/admin/facilities");
  revalidatePath(`/admin/facilities/${facility_id}`);
  redirect(`/admin/facilities/${facility_id}`);
}

export async function updateFacilityFollowUpOnly(formData: FormData) {
  await requireManager();

  const id = str(formData, "id");
  if (!id) {
    redirect("/admin/facilities");
  }

  const next_follow_up_at = parseIsoDatetime(str(formData, "next_follow_up_at"));
  const best_time_to_visit = optStr(formData, "best_time_to_visit");

  const { error } = await supabaseAdmin
    .from("facilities")
    .update({
      next_follow_up_at,
      best_time_to_visit,
    })
    .eq("id", id);

  if (error) {
    console.warn("[facilities] updateFacilityFollowUpOnly:", error.message);
    redirect(`/admin/facilities/${id}?followUpError=1`);
  }

  revalidatePath("/admin/facilities");
  revalidatePath(`/admin/facilities/${id}`);
  redirect(`/admin/facilities/${id}`);
}
