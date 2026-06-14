import { NextResponse } from "next/server";

import {
  listFacilityNotifications,
  runFacilityAlertGenerationForUser,
} from "@/lib/crm/facility-notifications";
import type { FacilityNotificationType } from "@/lib/crm/facility-notification-types";
import { FACILITY_NOTIFICATION_TYPES } from "@/lib/crm/facility-notification-types";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type FacilityNotificationsListResponse =
  | {
      ok: true;
      notifications: Awaited<ReturnType<typeof listFacilityNotifications>>["notifications"];
      summary: Awaited<ReturnType<typeof listFacilityNotifications>>["summary"];
      daily?: Awaited<ReturnType<typeof runFacilityAlertGenerationForUser>>["daily"];
      managerAlerts?: Awaited<ReturnType<typeof runFacilityAlertGenerationForUser>>["managerAlerts"];
    }
  | { ok: false; error: string };

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityNotificationsListResponse, {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const statusRaw = url.searchParams.get("status");
  const status =
    statusRaw === "read" || statusRaw === "unread" || statusRaw === "all" ? statusRaw : undefined;
  const typeRaw = url.searchParams.get("type");
  const type =
    typeRaw && (FACILITY_NOTIFICATION_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as FacilityNotificationType)
      : undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const generate = url.searchParams.get("generate") === "1";

  try {
    if (generate) {
      await runFacilityAlertGenerationForUser(staff);
    }

    const result = await listFacilityNotifications(staff, { status, limit, type });
    return NextResponse.json({
      ok: true,
      notifications: result.notifications,
      summary: result.summary,
    } satisfies FacilityNotificationsListResponse);
  } catch (e) {
    console.warn("[facilities/notifications] GET:", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies FacilityNotificationsListResponse, {
      status: 500,
    });
  }
}
