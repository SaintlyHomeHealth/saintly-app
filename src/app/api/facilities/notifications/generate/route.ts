import { NextResponse } from "next/server";

import { runFacilityAlertGenerationForUser } from "@/lib/crm/facility-notifications";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type FacilityNotificationsGenerateResponse =
  | {
      ok: true;
      daily: Awaited<ReturnType<typeof runFacilityAlertGenerationForUser>>["daily"];
      managerAlerts: Awaited<ReturnType<typeof runFacilityAlertGenerationForUser>>["managerAlerts"];
    }
  | { ok: false; error: string };

export async function POST() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityNotificationsGenerateResponse, {
      status: 403,
    });
  }

  try {
    const result = await runFacilityAlertGenerationForUser(staff);
    return NextResponse.json({
      ok: true,
      daily: result.daily,
      managerAlerts: result.managerAlerts,
    } satisfies FacilityNotificationsGenerateResponse);
  } catch (e) {
    console.warn("[facilities/notifications/generate]:", e);
    return NextResponse.json({ ok: false, error: "generate_failed" } satisfies FacilityNotificationsGenerateResponse, {
      status: 500,
    });
  }
}
