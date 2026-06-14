import { NextResponse } from "next/server";

import { createPlaybook, listPlaybooks } from "@/lib/crm/facility-playbooks";
import type { UpsertPlaybookInput } from "@/lib/crm/facility-playbooks";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export type PlaybooksListResponse =
  | { ok: true; playbooks: Awaited<ReturnType<typeof listPlaybooks>> }
  | { ok: false; error: string };

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies PlaybooksListResponse, { status: 403 });
  }

  const url = new URL(req.url);
  const includeSteps = url.searchParams.get("include_steps") === "1";

  try {
    const playbooks = await listPlaybooks(includeSteps);
    return NextResponse.json({ ok: true, playbooks } satisfies PlaybooksListResponse);
  } catch (e) {
    console.warn("[playbooks] GET:", e);
    return NextResponse.json({ ok: false, error: "load_failed" } satisfies PlaybooksListResponse, { status: 500 });
  }
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: UpsertPlaybookInput;
  try {
    body = (await req.json()) as UpsertPlaybookInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await createPlaybook(staff, body);
  if (!result.ok) {
    return NextResponse.json(result, { status: result.error === "forbidden" ? 403 : 400 });
  }
  return NextResponse.json(result);
}
