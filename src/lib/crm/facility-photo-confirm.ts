import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isFacilityPhotoType } from "@/lib/crm/facility-photos-constants";
import type { FacilityPhotoSuggestedActions } from "@/lib/crm/facility-photo-analyze";
import { similarFacilityNames } from "@/lib/crm/facility-match";

export type ConfirmFacilityPhotoInput = {
  facility_id: string;
  photo_ids: string[];
  activity_id?: string | null;
  photo_type?: string | null;
  ai_summary?: string | null;
  ai_extracted_json?: Record<string, unknown> | null;
  apply_suggested_actions?: boolean;
  suggested_actions?: FacilityPhotoSuggestedActions | null;
  /** update existing contact vs create new when business card */
  contact_mode?: "update_existing" | "create_new" | "skip";
  existing_contact_id?: string | null;
};

async function upsertContactFromPhoto(
  supabase: SupabaseClient,
  facilityId: string,
  actions: FacilityPhotoSuggestedActions,
  mode: "update_existing" | "create_new",
  existingContactId?: string | null
): Promise<string | null> {
  const name = (actions.contact_name ?? "").trim();
  if (!name && mode === "create_new") return null;

  if (mode === "update_existing" && existingContactId) {
    const patch: Record<string, unknown> = {};
    if (actions.contact_role) patch.title = actions.contact_role;
    if (actions.contact_email) patch.email = actions.contact_email;
    if (actions.contact_phone) patch.direct_phone = actions.contact_phone;
    if (Object.keys(patch).length > 0) {
      await supabase.from("facility_contacts").update(patch).eq("id", existingContactId);
    }
    return existingContactId;
  }

  const { data: existing } = await supabase
    .from("facility_contacts")
    .select("id, full_name, first_name, last_name")
    .eq("facility_id", facilityId)
    .eq("is_active", true)
    .limit(100);

  for (const row of existing ?? []) {
    const c = row as { id: string; full_name: string | null; first_name: string | null; last_name: string | null };
    const existingName =
      (c.full_name ?? "").trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (name && existingName && similarFacilityNames(existingName, name)) {
      const patch: Record<string, unknown> = {};
      if (actions.contact_role) patch.title = actions.contact_role;
      if (actions.contact_email) patch.email = actions.contact_email;
      if (actions.contact_phone) patch.direct_phone = actions.contact_phone;
      if (Object.keys(patch).length > 0) {
        await supabase.from("facility_contacts").update(patch).eq("id", c.id);
      }
      return c.id;
    }
  }

  const { data: inserted, error } = await supabase
    .from("facility_contacts")
    .insert({
      facility_id: facilityId,
      full_name: name || "Contact",
      title: actions.contact_role,
      email: actions.contact_email,
      direct_phone: actions.contact_phone,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted?.id) {
    console.warn("[facility-photo-confirm] contact:", error?.message);
    return null;
  }
  return inserted.id as string;
}

export async function confirmFacilityPhotoAnalysis(
  supabase: SupabaseClient,
  input: ConfirmFacilityPhotoInput
): Promise<
  | { ok: true; contact_id: string | null; activity_id: string | null }
  | { ok: false; error: string }
> {
  const photoIds = input.photo_ids.filter(Boolean);
  if (photoIds.length === 0) return { ok: false, error: "missing_photos" };

  const photo_type =
    input.photo_type && isFacilityPhotoType(input.photo_type) ? input.photo_type : input.photo_type ?? null;

  let contact_id: string | null = null;
  let activity_id = input.activity_id ?? null;

  if (input.apply_suggested_actions && input.suggested_actions) {
    const actions = input.suggested_actions;

    if (actions.create_or_update_contact && input.contact_mode !== "skip") {
      const mode =
        input.contact_mode ??
        (input.existing_contact_id ? "update_existing" : "create_new");
      contact_id = await upsertContactFromPhoto(
        supabase,
        input.facility_id,
        actions,
        mode,
        input.existing_contact_id
      );
    }

    if (activity_id && (actions.materials_dropped_off || actions.requested_packet || actions.got_business_card)) {
      const patch: Record<string, unknown> = {};
      if (actions.materials_dropped_off) patch.materials_dropped_off = true;
      if (actions.requested_packet) patch.requested_packet = true;
      if (actions.got_business_card) patch.got_business_card = true;
      if (contact_id) patch.facility_contact_id = contact_id;
      await supabase.from("facility_activities").update(patch).eq("id", activity_id);
    }
  }

  for (const photoId of photoIds) {
    await supabase
      .from("facility_activity_photos")
      .update({
        activity_id,
        contact_id: contact_id ?? undefined,
        photo_type,
        ai_summary: (input.ai_summary ?? "").trim() || null,
        ai_extracted_json: input.ai_extracted_json ?? null,
      })
      .eq("id", photoId)
      .eq("facility_id", input.facility_id);
  }

  return { ok: true, contact_id, activity_id };
}
