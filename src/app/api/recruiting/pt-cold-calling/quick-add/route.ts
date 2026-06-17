import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import {
  quickAddColdCallTarget,
  type QuickAddColdCallInput,
  type QuickAddResult,
} from "@/lib/recruiting/pt-cold-call-store";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export type QuickAddColdCallRequest = QuickAddColdCallInput;
export type QuickAddColdCallResponse = QuickAddResult;

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies QuickAddColdCallResponse, { status: 403 });
  }

  const user = await getAuthenticatedUser();

  let body: QuickAddColdCallRequest;
  try {
    body = (await req.json()) as QuickAddColdCallRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies QuickAddColdCallResponse, { status: 400 });
  }

  const result = await quickAddColdCallTarget(body, user?.id ?? staff.user_id ?? null);

  if (!result.ok) {
    const status = result.error === "save_failed" ? 500 : 400;
    return NextResponse.json(result satisfies QuickAddColdCallResponse, { status });
  }

  return NextResponse.json(result satisfies QuickAddColdCallResponse);
}
