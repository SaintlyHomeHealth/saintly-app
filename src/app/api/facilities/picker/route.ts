import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  searchFacilitiesForPicker,
} from "@/lib/crm/facility-outreach-dashboard";
import type { FacilityPickerResult } from "@/lib/crm/facility-outreach-types";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type FacilityPickerResponse =
  | { ok: true; results: FacilityPickerResult[] }
  | { ok: false; error: string };

type PickerBody = { query?: string };

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies FacilityPickerResponse, {
      status: 403,
    });
  }

  let body: PickerBody;
  try {
    body = (await req.json()) as PickerBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies FacilityPickerResponse, {
      status: 400,
    });
  }

  const results = await searchFacilitiesForPicker(supabaseAdmin, staff, body.query ?? "");
  return NextResponse.json({ ok: true, results } satisfies FacilityPickerResponse);
}
