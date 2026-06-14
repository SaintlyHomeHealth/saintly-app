import { NextResponse } from "next/server";

import { markFacilityNotificationRead } from "@/lib/crm/facility-notifications";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type FacilityNotificationReadResponse = { ok: true } | { ok: false; error: string };

type RouteContext = { params: Promise<{ notificationId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityNotificationReadResponse, {
      status: 403,
    });
  }

  const { notificationId } = await context.params;
  const result = await markFacilityNotificationRead(staff, notificationId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "not_found" } satisfies FacilityNotificationReadResponse, {
      status: 404,
    });
  }

  return NextResponse.json({ ok: true } satisfies FacilityNotificationReadResponse);
}
