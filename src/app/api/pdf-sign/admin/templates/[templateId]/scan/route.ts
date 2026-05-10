import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

/**
 * Placeholder scan endpoint. Returns no suggestions until server-side detection is wired.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await context.params;

  return NextResponse.json({
    pages: [] as Array<{ pageIndex: number; width: number; height: number }>,
    suggestions: [] as unknown[],
  });
}
