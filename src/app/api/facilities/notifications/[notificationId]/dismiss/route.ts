import { NextResponse } from "next/server";

import { dismissFacilityNotification } from "@/lib/crm/facility-notifications";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type FacilityNotificationDismissResponse = { ok: true } | { ok: false; error: string };

type RouteContext = { params: Promise<{ notificationId: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityNotificationDismissResponse, {
      status: 403,
    });
  }

  const { notificationId } = await context.params;
  const result = await dismissFacilityNotification(staff, notificationId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "not_found" } satisfies FacilityNotificationDismissResponse, {
      status: 404,
    });
  }

  return NextResponse.json({ ok: true } satisfies FacilityNotificationDismissResponse);
}
