import { NextResponse } from "next/server";

import { getRoutePlanDetail, updateRoutePlan } from "@/lib/crm/facility-route-plans";
import type { RoutePlanStatus } from "@/lib/crm/facility-route-types";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

type RouteContext = { params: Promise<{ routeId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { routeId } = await context.params;
  const route = await getRoutePlanDetail(staff, routeId);
  if (!route) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, route });
}

export async function PATCH(req: Request, context: RouteContext) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { routeId } = await context.params;
  let body: Partial<{ name: string; notes: string | null; assigned_rep_id: string | null; route_date: string; status: RoutePlanStatus }>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateRoutePlan(staff, routeId, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
