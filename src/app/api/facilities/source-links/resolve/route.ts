import { NextResponse } from "next/server";

import { resolveOrCreateSourceLink } from "@/lib/crm/facility-referral-source-links-admin";
import type { ResolveSourceLinkInput } from "@/lib/crm/facility-referral-source-link-types";
import { publicTokenSegment } from "@/lib/crm/referral-link-url";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: ResolveSourceLinkInput;
  try {
    body = (await req.json()) as ResolveSourceLinkInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await resolveOrCreateSourceLink(staff, {
    ...body,
    create_if_missing: body.create_if_missing !== false,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "forbidden" ? 403 : 404 });
  }

  const segment = publicTokenSegment(result.link);
  return NextResponse.json({
    ok: true,
    link: result.link,
    token: segment,
  });
}
