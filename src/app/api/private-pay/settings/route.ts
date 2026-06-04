import { NextResponse, type NextRequest } from "next/server";

import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import {
  getPrivatePaySettingsRow,
  upsertPrivatePaySettings,
} from "@/lib/private-pay/settings-data";
import {
  privatePaySettingsInputFromRow,
  type PrivatePaySettingsInput,
} from "@/lib/private-pay/payment-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const row = await getPrivatePaySettingsRow();
  return NextResponse.json({
    ok: true,
    settings: privatePaySettingsInputFromRow(row),
    updated_at: row?.updated_at ?? null,
  });
}

function parseSettingsBody(body: Record<string, unknown>): PrivatePaySettingsInput {
  return {
    zelle_name: String(body.zelle_name ?? ""),
    zelle_phone: String(body.zelle_phone ?? ""),
    zelle_email: String(body.zelle_email ?? ""),
    cashapp_tag: String(body.cashapp_tag ?? ""),
    apple_cash_phone: String(body.apple_cash_phone ?? ""),
    apple_cash_email: String(body.apple_cash_email ?? ""),
    check_payable_to: String(body.check_payable_to ?? ""),
    mailing_address: String(body.mailing_address ?? ""),
    manual_note: String(body.manual_note ?? ""),
    show_zelle: body.show_zelle !== false,
    show_cashapp: body.show_cashapp !== false,
    show_apple_cash: body.show_apple_cash !== false,
    show_cash_check: body.show_cash_check !== false,
    show_stripe: body.show_stripe !== false,
    preferred_payment_method: "zelle",
  };
}

export async function PUT(req: NextRequest) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    const row = await upsertPrivatePaySettings(parseSettingsBody(body), auth.auth.user.id);
    return NextResponse.json({
      ok: true,
      settings: privatePaySettingsInputFromRow(row),
      updated_at: row.updated_at,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save settings";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
