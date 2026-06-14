import { NextResponse } from "next/server";

import {
  createPacketRequest,
  listPacketRequests,
  type CreatePacketRequestInput,
  type ListPacketRequestsFilters,
} from "@/lib/crm/facility-packet-requests";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const filters: ListPacketRequestsFilters = {
    status: url.searchParams.get("status") ?? undefined,
    assigned_to: url.searchParams.get("assigned_to") ?? undefined,
    facility_id: url.searchParams.get("facility_id") ?? undefined,
    delivery_method: url.searchParams.get("delivery_method") ?? undefined,
    packet_type: url.searchParams.get("packet_type") ?? undefined,
    due: (url.searchParams.get("due") as ListPacketRequestsFilters["due"]) ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    facility_type: url.searchParams.get("facility_type") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 50,
    offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0,
  };

  const result = await listPacketRequests(staff, filters);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: CreatePacketRequestInput;
  try {
    body = (await req.json()) as CreatePacketRequestInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createPacketRequest(staff, body);
  if (!result.ok) {
    const status = result.error === "duplicate_open" ? 409 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
