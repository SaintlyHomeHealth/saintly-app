import { NextResponse, type NextRequest } from "next/server";

import { getAppBaseUrl } from "@/lib/app-url";
import { createCardSetupCheckoutSession } from "@/lib/private-pay/checkout";
import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { supabaseAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ contactId: string }> }
) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { contactId } = await ctx.params;
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, full_name, first_name, last_name, email, primary_phone")
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const name =
    (contact.full_name ?? "").trim() ||
    `${(contact.first_name ?? "").trim()} ${(contact.last_name ?? "").trim()}`.trim();

  const result = await createCardSetupCheckoutSession(contactId, getAppBaseUrl(req.nextUrl.origin), {
    name,
    email: contact.email,
    phone: contact.primary_phone,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, url: result.url });
}
