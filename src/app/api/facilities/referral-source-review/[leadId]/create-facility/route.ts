import { NextResponse } from "next/server";

import { createFacilityFromReferralReview } from "@/lib/crm/facility-referral-source-review";
import { getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function POST(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { leadId } = await context.params;
  let body: {
    facility?: {
      name?: string;
      city?: string | null;
      state?: string | null;
      main_phone?: string | null;
      email?: string | null;
      type?: string | null;
    };
    contact?: { name?: string | null; phone?: string | null; email?: string | null } | null;
    note?: string | null;
    skip_duplicate_check?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createFacilityFromReferralReview(staff, leadId, {
    facility: body.facility ?? { name: "" },
    contact: body.contact,
    note: body.note,
    skip_duplicate_check: body.skip_duplicate_check,
  });

  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "not_found"
          ? 404
          : result.error === "possible_duplicate"
            ? 409
            : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
