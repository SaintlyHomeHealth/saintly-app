import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { loadFacilityAnalytics } from "@/lib/crm/facility-analytics";
import type { FacilityAnalyticsData } from "@/lib/crm/facility-analytics-types";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export type FacilityAnalyticsResponse =
  | { ok: true; data: FacilityAnalyticsData }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseFilters(url: URL) {
  const today = getCrmCalendarTodayIso();
  const start_date = url.searchParams.get("start_date")?.trim() || addCalendarDaysToIsoDate(today, -29);
  const end_date = url.searchParams.get("end_date")?.trim() || today;

  if (!DATE_RE.test(start_date) || !DATE_RE.test(end_date)) {
    return { error: "invalid_date" as const };
  }

  return {
    startDate: start_date,
    endDate: end_date,
    repId: url.searchParams.get("rep_id") || null,
    city: url.searchParams.get("city") || null,
    facilityType: url.searchParams.get("facility_type") || null,
    source: url.searchParams.get("source") || null,
  };
}

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityAnalyticsResponse, {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const parsed = parseFilters(url);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: "invalid_date" } satisfies FacilityAnalyticsResponse, {
      status: 400,
    });
  }

  try {
    const data = await loadFacilityAnalytics(supabaseAdmin, staff, parsed);
    return NextResponse.json({ ok: true, data } satisfies FacilityAnalyticsResponse);
  } catch (e) {
    console.warn("[facilities/analytics]", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies FacilityAnalyticsResponse, {
      status: 500,
    });
  }
}
