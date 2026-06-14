import { NextResponse } from "next/server";

import {
  archiveSourceLink,
  createSourceLink,
  listSourceLinks,
} from "@/lib/crm/facility-referral-source-links-admin";
import type { CreateSourceLinkInput } from "@/lib/crm/facility-referral-source-link-types";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const links = await listSourceLinks(staff, {
    link_type: url.searchParams.get("link_type"),
    campaign_id: url.searchParams.get("campaign_id"),
    facility_id: url.searchParams.get("facility_id"),
    sales_rep_id: url.searchParams.get("sales_rep_id"),
    status: url.searchParams.get("status"),
  });

  return NextResponse.json({ ok: true, links });
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: CreateSourceLinkInput;
  try {
    body = (await req.json()) as CreateSourceLinkInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createSourceLink(staff, body);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "forbidden" ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, link: result.link });
}
