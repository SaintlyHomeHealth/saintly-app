import { NextResponse } from "next/server";

import {
  canViewReferralSourceReview,
  listReferralSourceReviewItems,
} from "@/lib/crm/facility-referral-source-review";
import type { ReferralSourceReviewStatus } from "@/lib/crm/facility-referral-source-review-types";
import { getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canViewReferralSourceReview(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "needs_review") as ReferralSourceReviewStatus;
  const source_type = url.searchParams.get("source_type");
  const search = url.searchParams.get("search");
  const start_date = url.searchParams.get("start_date");
  const end_date = url.searchParams.get("end_date");
  const limit = Number(url.searchParams.get("limit") ?? "30");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const result = await listReferralSourceReviewItems(staff, {
    status,
    source_type,
    search,
    start_date,
    end_date,
    limit,
    offset,
  });

  return NextResponse.json({ ok: true, ...result });
}
