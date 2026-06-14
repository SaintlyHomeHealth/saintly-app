import { NextResponse } from "next/server";

import type { FacilityReferralLeadInput } from "@/lib/crm/facility-referral-lead-types";
import { createFacilityReferralLead } from "@/lib/crm/facility-referral-lead";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReferralLeadResponse =
  | {
      ok: true;
      lead: { id: string; status: string | null };
      facility: { id: string; name: string };
      activity: { id: string } | null;
      follow_up_task_id: string | null;
    }
  | {
      ok: false;
      error: string;
      duplicate_check?: boolean;
      possible_duplicates?: Array<{
        lead_id: string;
        patient_name: string;
        status: string | null;
        matched_by: string[];
        created_at: string | null;
      }>;
    };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ facilityId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies ReferralLeadResponse, {
      status: 403,
    });
  }

  const { facilityId } = await ctx.params;
  if (!facilityId?.trim() || !UUID_RE.test(facilityId.trim())) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies ReferralLeadResponse, {
      status: 400,
    });
  }

  let body: FacilityReferralLeadInput;
  try {
    body = (await req.json()) as FacilityReferralLeadInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies ReferralLeadResponse, {
      status: 400,
    });
  }

  const input: FacilityReferralLeadInput = {
    ...body,
    facility_id: facilityId.trim(),
  };

  try {
    const result = await createFacilityReferralLead(staff, input);

    if (!result.ok) {
      const status =
        result.error === "duplicate_found"
          ? 409
          : result.error === "facility_not_found" || result.error === "activity_not_found"
            ? 404
            : result.error === "forbidden"
              ? 403
              : 400;
      return NextResponse.json(result satisfies ReferralLeadResponse, { status });
    }

    return NextResponse.json(result satisfies ReferralLeadResponse);
  } catch (e) {
    console.warn("[referral-lead] create:", e);
    return NextResponse.json({ ok: false, error: "create_failed" } satisfies ReferralLeadResponse, {
      status: 500,
    });
  }
}
