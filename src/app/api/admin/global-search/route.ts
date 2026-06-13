import { NextResponse } from "next/server";

import { canAccessGlobalSearch } from "@/lib/admin/global-search/access";
import { runGlobalSearch } from "@/lib/admin/global-search/run";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";

export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessGlobalSearch(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

  if (q.length < 1) {
    return NextResponse.json({
      query: "",
      results: [],
      groups: { bestMatches: [], leads: [], patients: [], calls: [], privatePay: [], other: [] },
    });
  }

  try {
    const payload = await runGlobalSearch(supabaseAdmin, q, limit);
    return NextResponse.json(payload);
  } catch (err) {
    console.warn("[api/admin/global-search]", err);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
