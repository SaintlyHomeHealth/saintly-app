import { NextResponse } from "next/server";

import { updateColdCallTarget, type UpdateTargetInput } from "@/lib/recruiting/pt-cold-call-store";
import type { PtColdCallTargetRow } from "@/lib/recruiting/pt-cold-call-types";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export type UpdateTargetResponse =
  | { ok: true; target: PtColdCallTargetRow }
  | { ok: false; error: string };

export async function PATCH(req: Request, context: { params: Promise<{ targetId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies UpdateTargetResponse, { status: 403 });
  }

  const { targetId } = await context.params;
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "missing_id" } satisfies UpdateTargetResponse, { status: 400 });
  }

  let body: UpdateTargetInput;
  try {
    body = (await req.json()) as UpdateTargetInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies UpdateTargetResponse, { status: 400 });
  }

  const result = await updateColdCallTarget(targetId, body);
  if (!result.ok) {
    const status = result.error === "save_failed" ? 500 : 400;
    return NextResponse.json(result satisfies UpdateTargetResponse, { status });
  }

  return NextResponse.json(result satisfies UpdateTargetResponse);
}
