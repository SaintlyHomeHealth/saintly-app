import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  analyzeFacilityPhotosWithAi,
  type FacilityPhotoAnalysis,
  type FacilityPhotoSourceContext,
} from "@/lib/crm/facility-photo-analyze";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FacilityPhotoAnalyzeResponse =
  | { ok: true; analysis: FacilityPhotoAnalysis }
  | { ok: false; error: string };

type AnalyzeBody = {
  facility_id?: string;
  activity_id?: string | null;
  photo_ids?: string[];
  context_note?: string | null;
  source_context?: FacilityPhotoSourceContext;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityPhotoAnalyzeResponse, {
      status: 403,
    });
  }

  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies FacilityPhotoAnalyzeResponse, {
      status: 400,
    });
  }

  const facility_id = (body.facility_id ?? "").trim();
  if (!UUID_RE.test(facility_id)) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies FacilityPhotoAnalyzeResponse, {
      status: 400,
    });
  }

  const photo_ids = Array.isArray(body.photo_ids) ? body.photo_ids.filter((id) => UUID_RE.test(String(id))) : [];
  if (photo_ids.length === 0) {
    return NextResponse.json({ ok: false, error: "missing_photos" } satisfies FacilityPhotoAnalyzeResponse, {
      status: 400,
    });
  }

  const result = await analyzeFacilityPhotosWithAi(supabaseAdmin, {
    facility_id,
    photo_ids,
    context_note: body.context_note ?? null,
    source_context: body.source_context,
  });

  if (!result.ok) {
    const status = result.error === "ai_not_configured" ? 503 : result.error === "photos_not_found" ? 404 : 502;
    return NextResponse.json({ ok: false, error: result.error } satisfies FacilityPhotoAnalyzeResponse, { status });
  }

  return NextResponse.json({ ok: true, analysis: result.analysis } satisfies FacilityPhotoAnalyzeResponse);
}
