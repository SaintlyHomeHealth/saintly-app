import { NextResponse } from "next/server";

import type { FacilityReferralPipelineStageKey } from "@/lib/crm/facility-referral-pipeline-types";
import { FACILITY_REFERRAL_PIPELINE_STAGES } from "@/lib/crm/facility-referral-pipeline-types";
import { listFacilityReferralPipeline } from "@/lib/crm/facility-referral-pipeline";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FacilityReferralsListResponse =
  | {
      ok: true;
      referrals: Awaited<ReturnType<typeof listFacilityReferralPipeline>>["referrals"];
      summary: Awaited<ReturnType<typeof listFacilityReferralPipeline>>["summary"];
      pipeline_health: Awaited<ReturnType<typeof listFacilityReferralPipeline>>["pipeline_health"];
    }
  | { ok: false; error: string };

const STAGE_KEYS = new Set(FACILITY_REFERRAL_PIPELINE_STAGES.map((s) => s.key));

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityReferralsListResponse, {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const stageRaw = url.searchParams.get("status") ?? url.searchParams.get("stage");
  const stage =
    stageRaw && STAGE_KEYS.has(stageRaw as FacilityReferralPipelineStageKey)
      ? (stageRaw as FacilityReferralPipelineStageKey)
      : null;

  try {
    const result = await listFacilityReferralPipeline(staff, {
      stage,
      facility_id: url.searchParams.get("facility_id"),
      rep_id: url.searchParams.get("rep_id"),
      intake_owner_id: url.searchParams.get("intake_owner_id"),
      start_date: url.searchParams.get("start_date"),
      end_date: url.searchParams.get("end_date"),
      city: url.searchParams.get("city"),
      payer: url.searchParams.get("payer"),
      service_needed: url.searchParams.get("service_needed"),
      needs_source_review: url.searchParams.get("needs_source_review") === "1",
      has_documents: url.searchParams.get("has_documents") === "1",
      needs_document_review: url.searchParams.get("needs_document_review") === "1",
      no_documents: url.searchParams.get("no_documents") === "1",
      ai_review_needed: url.searchParams.get("ai_review_needed") === "1",
      missing_physician_order: url.searchParams.get("missing_physician_order") === "1",
      missing_insurance: url.searchParams.get("missing_insurance") === "1",
      missing_demographics: url.searchParams.get("missing_demographics") === "1",
      readiness_status: url.searchParams.get("readiness_status"),
    });

    return NextResponse.json({
      ok: true,
      referrals: result.referrals,
      summary: result.summary,
      pipeline_health: result.pipeline_health,
    } satisfies FacilityReferralsListResponse);
  } catch (e) {
    console.warn("[facilities/referrals] list:", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies FacilityReferralsListResponse, {
      status: 500,
    });
  }
}
