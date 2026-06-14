import { NextResponse } from "next/server";

import {
  quickAddFacilityFromPlace,
  type QuickAddFromPlaceInput,
} from "@/lib/crm/facility-quick-add-from-place";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type QuickAddFromPlaceRequest = QuickAddFromPlaceInput;

export type QuickAddFromPlaceResponse =
  | {
      ok: true;
      facility_id: string;
      name: string;
    }
  | {
      ok: false;
      error: string;
      duplicates?: Array<{
        id: string;
        name: string;
        city: string | null;
        main_phone: string | null;
        address: string;
        match_reason: string;
        match_confidence: number;
      }>;
    };

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies QuickAddFromPlaceResponse, {
      status: 403,
    });
  }

  const user = await getAuthenticatedUser();

  let body: QuickAddFromPlaceRequest;
  try {
    body = (await req.json()) as QuickAddFromPlaceRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies QuickAddFromPlaceResponse, {
      status: 400,
    });
  }

  const result = await quickAddFacilityFromPlace(staff, {
    ...body,
    imported_by_user_id: user?.id ?? staff.user_id,
  });

  if (!result.ok) {
    const status = result.error === "save_failed" ? 500 : 400;
    return NextResponse.json(result satisfies QuickAddFromPlaceResponse, { status });
  }

  return NextResponse.json(result satisfies QuickAddFromPlaceResponse);
}
