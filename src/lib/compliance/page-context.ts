import "server-only";

import { redirect } from "next/navigation";

import { canUnlockCompliance, canUseComplianceLogs, staffDisplayName } from "@/lib/compliance/access";
import { parsePeriodParams, phoenixNowParts, yearChoices, type Quarter } from "@/lib/compliance/period";
import { getStaffProfile } from "@/lib/staff-profile";

export async function complianceContext(search: { year?: string; quarter?: string }) {
  const staff = await getStaffProfile();
  if (!staff || !canUseComplianceLogs(staff)) redirect("/admin");
  const now = phoenixNowParts();
  const period = parsePeriodParams(search.year, search.quarter, now.ymd);
  return {
    staff,
    signerName: staffDisplayName(staff),
    canUnlock: canUnlockCompliance(staff),
    today: now.ymd,
    time: now.time,
    year: period.year,
    quarter: period.quarter as Quarter,
    years: yearChoices(now.ymd),
  };
}
