import { NextResponse } from "next/server";

import {
  createFacilityNotification,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: { local_id?: string; type?: string; message?: string; facility_name?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const localId = body.local_id ?? "unknown";
  queueFacilityNotification(() =>
    createFacilityNotification({
      userId: staff.user_id,
      notificationType: "facility_offline_sync_failed",
      title: "Field sync failed",
      message: body.message ?? `Could not sync ${body.type ?? "item"}.`,
      severity: "urgent",
      actionUrl: "/admin/facilities/field",
      metadata: { local_id: localId, facility_name: body.facility_name },
      dedupeKey: `facility_offline_sync_failed:${localId}`,
    })
  );

  return NextResponse.json({ ok: true });
}
