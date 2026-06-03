import { NextResponse, type NextRequest } from "next/server";

import { requirePrivatePayStaff } from "@/lib/private-pay/auth";
import { createPrivatePayCustomer } from "@/lib/private-pay/recipients";
import type { PrivatePayCustomerInput } from "@/lib/private-pay/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requirePrivatePayStaff();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: PrivatePayCustomerInput;
  try {
    body = (await req.json()) as PrivatePayCustomerInput;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await createPrivatePayCustomer(body, auth.auth.user.id);
  if (!result.ok) {
    const status = result.duplicate_recipient ? 409 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        duplicate_recipient: result.duplicate_recipient ?? null,
      },
      { status }
    );
  }

  return NextResponse.json({ ok: true, recipient: result.recipient });
}
