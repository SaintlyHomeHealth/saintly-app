import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import type { FacilityPhotoSuggestedActions } from "@/lib/crm/facility-photo-analyze";
import { confirmFacilityPhotoAnalysis } from "@/lib/crm/facility-photo-confirm";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FacilityPhotoConfirmResponse =
  | { ok: true; contact_id: string | null; activity_id: string | null }
  | { ok: false; error: string };

type ConfirmBody = {
  facility_id: string;
  photo_ids: string[];
  activity_id?: string | null;
  photo_type?: string | null;
  ai_summary?: string | null;
  ai_extracted_json?: Record<string, unknown> | null;
  apply_suggested_actions?: boolean;
  suggested_actions?: FacilityPhotoSuggestedActions | null;
  contact_mode?: "update_existing" | "create_new" | "skip";
  existing_contact_id?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityPhotoConfirmResponse, {
      status: 403,
    });
  }

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies FacilityPhotoConfirmResponse, {
      status: 400,
    });
  }

  const facility_id = (body.facility_id ?? "").trim();
  if (!UUID_RE.test(facility_id)) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies FacilityPhotoConfirmResponse, {
      status: 400,
    });
  }

  const photo_ids = Array.isArray(body.photo_ids) ? body.photo_ids.filter((id) => UUID_RE.test(String(id))) : [];
  if (photo_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_photos" } satisfies FacilityPhotoConfirmResponse, {
      status: 400,
    });
  }

  const activity_id =
    body.activity_id && UUID_RE.test(body.activity_id) ? body.activity_id : null;

  const result = await confirmFacilityPhotoAnalysis(supabaseAdmin, {
    facility_id,
    photo_ids,
    activity_id,
    photo_type: body.photo_type ?? null,
    ai_summary: body.ai_summary ?? null,
    ai_extracted_json: body.ai_extracted_json ?? null,
    apply_suggested_actions: Boolean(body.apply_suggested_actions),
    suggested_actions: body.suggested_actions ?? null,
    contact_mode: body.contact_mode,
    existing_contact_id: body.existing_contact_id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error } satisfies FacilityPhotoConfirmResponse, {
      status: 400,
    });
  }

  return NextResponse.json({
    ok: true,
    contact_id: result.contact_id,
    activity_id: result.activity_id,
  } satisfies FacilityPhotoConfirmResponse);
}
