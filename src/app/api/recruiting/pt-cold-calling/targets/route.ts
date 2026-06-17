import { NextResponse } from "next/server";

import { phoenixEndOfTodayIso } from "@/lib/recruiting/phoenix-time";
import { computePtColdCallCounts } from "@/lib/recruiting/pt-cold-call-filters";
import { fetchTargetsWithLatest } from "@/lib/recruiting/pt-cold-call-store";
import type { PtColdCallDashboardCounts, PtColdCallTargetWithLatest } from "@/lib/recruiting/pt-cold-call-types";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export type PtColdCallTargetsResponse = {
  targets: PtColdCallTargetWithLatest[];
  counts: PtColdCallDashboardCounts;
  cutoff_iso: string;
};

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targets = await fetchTargetsWithLatest();
  const cutoff = phoenixEndOfTodayIso();
  const counts = computePtColdCallCounts(targets, cutoff);

  const payload: PtColdCallTargetsResponse = { targets, counts, cutoff_iso: cutoff };
  return NextResponse.json(payload);
}
