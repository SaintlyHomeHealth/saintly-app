import { NextResponse, type NextRequest } from "next/server";

import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { searchPrivatePayRecipients } from "@/lib/private-pay/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const results = await searchPrivatePayRecipients(q);
  return NextResponse.json({ ok: true, ...results });
}
