import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { loadFacilityAnalyticsExportRows } from "@/lib/crm/facility-analytics";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { csvRow } from "@/lib/export/marketing-email-csv";
import { formatFacilityDate, formatFacilityDateTime } from "@/lib/crm/facility-address";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const today = getCrmCalendarTodayIso();
  const start_date = url.searchParams.get("start_date")?.trim() || addCalendarDaysToIsoDate(today, -29);
  const end_date = url.searchParams.get("end_date")?.trim() || today;

  if (!DATE_RE.test(start_date) || !DATE_RE.test(end_date)) {
    return NextResponse.json({ ok: false, error: "invalid_date" }, { status: 400 });
  }

  try {
    const rows = await loadFacilityAnalyticsExportRows(supabaseAdmin, staff, {
      startDate: start_date,
      endDate: end_date,
      repId: url.searchParams.get("rep_id") || null,
      city: url.searchParams.get("city") || null,
      facilityType: url.searchParams.get("facility_type") || null,
      source: url.searchParams.get("source") || null,
    });

    const header = csvRow([
      "Date",
      "Facility",
      "City",
      "Type",
      "Rep",
      "Activity type",
      "Outcome",
      "Notes",
      "Follow-up date",
      "Materials dropped",
      "Packet requested",
      "Decision maker met",
      "Referral potential",
      "Photos count",
    ]);

    const body = rows
      .map((r) =>
        csvRow([
          formatFacilityDateTime(r.activityAt),
          r.facilityName,
          r.city ?? "",
          r.facilityType ?? "",
          r.repLabel ?? "",
          r.activityType,
          r.outcome ?? "",
          r.notes ?? "",
          r.nextFollowUpAt ? formatFacilityDate(r.nextFollowUpAt) : "",
          r.materialsDropped ? "Yes" : "No",
          r.packetRequested ? "Yes" : "No",
          r.decisionMakerMet ? "Yes" : "No",
          r.referralPotential ?? "",
          String(r.photosCount),
        ])
      )
      .join("");

    const csv = `\ufeff${header}${body}`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="facility-outreach-analytics-${start_date}-to-${end_date}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.warn("[facilities/analytics/export]", e);
    return NextResponse.json({ ok: false, error: "export_failed" }, { status: 500 });
  }
}
