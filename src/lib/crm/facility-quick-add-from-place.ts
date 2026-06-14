import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  findQuickAddDuplicates,
  type PortalFacilityForMatch,
} from "@/lib/crm/facility-match";
import { isValidFacilityType } from "@/lib/crm/facility-options";
import type { StaffProfile } from "@/lib/staff-profile";

export type QuickAddFromPlaceInput = {
  name: string;
  address_line_1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  main_phone?: string | null;
  website?: string | null;
  type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  specialty_tags?: string[] | null;
  notes?: string | null;
  create_anyway?: boolean;
  imported_by_user_id?: string | null;
};

export async function quickAddFacilityFromPlace(
  staff: StaffProfile,
  body: QuickAddFromPlaceInput
): Promise<
  | { ok: true; facility_id: string; name: string }
  | {
      ok: false;
      error: string;
      duplicates?: Array<{
        id: string;
        name: string;
        city: string | null;
        main_phone: string | null;
        address: string;
        match_reason: string;
        match_confidence: number;
      }>;
    }
> {
  const name = (body.name ?? "").trim();
  if (!name) return { ok: false, error: "missing_name" };

  const { data: facilityRows } = await supabaseAdmin
    .from("facilities")
    .select("id, name, city, state, zip, address_line_1, address_line_2, main_phone, website, google_place_id")
    .eq("is_active", true)
    .limit(2000);

  const portalFacilities = (facilityRows ?? []) as PortalFacilityForMatch[];

  const formatted_address = [
    (body.address_line_1 ?? "").trim(),
    [(body.city ?? "").trim(), [(body.state ?? "").trim(), (body.zip ?? "").trim()].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ");

  if (!body.create_anyway) {
    const duplicates = findQuickAddDuplicates(
      {
        google_place_id: (body.google_place_id ?? "").trim(),
        name,
        formatted_address,
        phone: (body.main_phone ?? "").trim() || null,
        website: (body.website ?? "").trim() || null,
        city: (body.city ?? "").trim() || null,
      },
      portalFacilities
    );

    if (duplicates.length > 0) {
      return { ok: false, error: "possible_duplicate", duplicates };
    }
  }

  const typeRaw = (body.type ?? "").trim();
  const type = typeRaw && isValidFacilityType(typeRaw) ? typeRaw : null;
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("facilities")
    .insert({
      name,
      type,
      status: "New",
      priority: "Medium",
      address_line_1: (body.address_line_1 ?? "").trim() || null,
      city: (body.city ?? "").trim() || null,
      state: (body.state ?? "").trim() || null,
      zip: (body.zip ?? "").trim() || null,
      main_phone: (body.main_phone ?? "").trim() || null,
      website: (body.website ?? "").trim() || null,
      latitude: typeof body.latitude === "number" ? body.latitude : null,
      longitude: typeof body.longitude === "number" ? body.longitude : null,
      google_place_id: (body.google_place_id ?? "").trim() || null,
      source: "google_places",
      source_last_synced_at: now,
      specialty_tags: Array.isArray(body.specialty_tags) ? body.specialty_tags.filter(Boolean) : null,
      general_notes: (body.notes ?? "").trim() || null,
      imported_by_user_id: body.imported_by_user_id ?? staff.user_id,
      imported_at: now,
      is_active: true,
    })
    .select("id, name")
    .maybeSingle();

  if (error || !data?.id) {
    if (error?.code === "23505") return { ok: false, error: "duplicate_google_place_id" };
    return { ok: false, error: "save_failed" };
  }

  return { ok: true, facility_id: String(data.id), name: String(data.name) };
}
