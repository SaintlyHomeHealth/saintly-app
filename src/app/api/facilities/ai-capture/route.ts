import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  analyzeFacilityNoteWithAi,
  type FacilityAiCaptureDraft,
  type FacilityAiCaptureSourceContext,
} from "@/lib/crm/facility-ai-capture";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type AiCaptureAnalyzeResponse =
  | { ok: true; draft: FacilityAiCaptureDraft }
  | { ok: false; error: string };

type AiCaptureRequestBody = {
  raw_text?: string;
  selected_facility_id?: string | null;
  selected_facility_name?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  source_context?: FacilityAiCaptureSourceContext;
  route_draft_stops?: Array<{ facilityId?: string; googlePlaceId?: string; name: string }>;
};

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies AiCaptureAnalyzeResponse, {
      status: 403,
    });
  }

  let body: AiCaptureRequestBody;
  try {
    body = (await req.json()) as AiCaptureRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies AiCaptureAnalyzeResponse, {
      status: 400,
    });
  }

  const result = await analyzeFacilityNoteWithAi({
    raw_text: body.raw_text ?? "",
    selected_facility_id: body.selected_facility_id ?? null,
    selected_facility_name: body.selected_facility_name ?? null,
    current_latitude: body.current_latitude ?? null,
    current_longitude: body.current_longitude ?? null,
    source_context: body.source_context,
    route_draft_stops: body.route_draft_stops ?? [],
    supabase: supabaseAdmin,
  });

  if (!result.ok) {
    const status =
      result.error === "ai_not_configured"
        ? 503
        : result.error === "note_too_short"
          ? 400
          : 502;
    return NextResponse.json({ ok: false, error: result.error } satisfies AiCaptureAnalyzeResponse, {
      status,
    });
  }

  return NextResponse.json({ ok: true, draft: result.draft } satisfies AiCaptureAnalyzeResponse);
}
