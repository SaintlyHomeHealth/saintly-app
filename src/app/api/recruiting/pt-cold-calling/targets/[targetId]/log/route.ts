import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { addCallLog, type AddCallLogInput } from "@/lib/recruiting/pt-cold-call-store";
import type { PtColdCallLogRow, PtColdCallTargetRow } from "@/lib/recruiting/pt-cold-call-types";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export type AddCallLogRequest = AddCallLogInput;
export type AddCallLogResponse =
  | { ok: true; target: PtColdCallTargetRow; log: PtColdCallLogRow }
  | { ok: false; error: string };

export async function POST(req: Request, context: { params: Promise<{ targetId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies AddCallLogResponse, { status: 403 });
  }

  const { targetId } = await context.params;
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "missing_id" } satisfies AddCallLogResponse, { status: 400 });
  }

  const user = await getAuthenticatedUser();

  let body: AddCallLogRequest;
  try {
    body = (await req.json()) as AddCallLogRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies AddCallLogResponse, { status: 400 });
  }

  const result = await addCallLog(targetId, body, user?.id ?? staff.user_id ?? null);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "save_failed" ? 500 : 400;
    return NextResponse.json(result satisfies AddCallLogResponse, { status });
  }

  return NextResponse.json(result satisfies AddCallLogResponse);
}
