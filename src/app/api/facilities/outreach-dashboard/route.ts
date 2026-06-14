import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { loadOutreachDashboard } from "@/lib/crm/facility-outreach-dashboard";
import type { OutreachDashboardData } from "@/lib/crm/facility-outreach-types";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type OutreachDashboardResponse =
  | { ok: true; data: OutreachDashboardData }
  | { ok: false; error: string };

type OutreachDashboardBody = {
  latitude?: number | null;
  longitude?: number | null;
  radius_miles?: number | null;
};

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies OutreachDashboardResponse, {
      status: 403,
    });
  }

  let body: OutreachDashboardBody = {};
  try {
    body = (await req.json()) as OutreachDashboardBody;
  } catch {
    body = {};
  }

  try {
    const data = await loadOutreachDashboard(supabaseAdmin, staff, {
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      radiusMiles: body.radius_miles ?? 15,
    });

    return NextResponse.json({ ok: true, data } satisfies OutreachDashboardResponse);
  } catch (e) {
    console.warn("[outreach-dashboard]", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies OutreachDashboardResponse, {
      status: 500,
    });
  }
}

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies OutreachDashboardResponse, {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const lat = url.searchParams.get("latitude");
  const lng = url.searchParams.get("longitude");
  const radius = url.searchParams.get("radius_miles");

  try {
    const data = await loadOutreachDashboard(supabaseAdmin, staff, {
      latitude: lat ? Number(lat) : null,
      longitude: lng ? Number(lng) : null,
      radiusMiles: radius ? Number(radius) : 15,
    });

    return NextResponse.json({ ok: true, data } satisfies OutreachDashboardResponse);
  } catch (e) {
    console.warn("[outreach-dashboard]", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies OutreachDashboardResponse, {
      status: 500,
    });
  }
}
