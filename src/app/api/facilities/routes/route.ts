import { NextResponse } from "next/server";

import { createRoutePlan, listRoutePlans } from "@/lib/crm/facility-route-plans";
import type { CreateRoutePlanInput } from "@/lib/crm/facility-route-types";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const result = await listRoutePlans(staff, {
    assigned_rep_id: url.searchParams.get("assigned_rep_id") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    start_date: url.searchParams.get("start_date") ?? undefined,
    end_date: url.searchParams.get("end_date") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: CreateRoutePlanInput;
  try {
    body = (await req.json()) as CreateRoutePlanInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createRoutePlan(staff, body);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
