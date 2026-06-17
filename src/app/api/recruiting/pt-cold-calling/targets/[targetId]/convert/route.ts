import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { convertTargetToCandidate, type ConvertToCandidateInput } from "@/lib/recruiting/pt-cold-call-store";
import type { PtColdCallTargetRow } from "@/lib/recruiting/pt-cold-call-types";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export type ConvertToCandidateRequest = ConvertToCandidateInput;
export type ConvertToCandidateResponse =
  | { ok: true; candidate_id: string; target: PtColdCallTargetRow }
  | { ok: false; error: string };

export async function POST(req: Request, context: { params: Promise<{ targetId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies ConvertToCandidateResponse, { status: 403 });
  }

  const { targetId } = await context.params;
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "missing_id" } satisfies ConvertToCandidateResponse, { status: 400 });
  }

  const user = await getAuthenticatedUser();

  let body: ConvertToCandidateRequest;
  try {
    body = (await req.json()) as ConvertToCandidateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies ConvertToCandidateResponse, { status: 400 });
  }

  const result = await convertTargetToCandidate(targetId, body, user?.id ?? staff.user_id ?? null);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "save_failed" ? 500 : 400;
    return NextResponse.json(result satisfies ConvertToCandidateResponse, { status });
  }

  return NextResponse.json(result satisfies ConvertToCandidateResponse);
}
