import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { searchAvailableTwilioNumbers } from "@/lib/twilio/search-available-twilio-numbers";

function parseAreaCodesFromBody(body: Record<string, unknown>): number[] | undefined {
  const raw = body.areaCodes;
  if (!Array.isArray(raw)) return undefined;
  const out: number[] = [];
  for (const item of raw) {
    if (typeof item === "number" && Number.isFinite(item)) {
      const n = Math.floor(item);
      if (n >= 200 && n <= 999) out.push(n);
      continue;
    }
    if (typeof item === "string") {
      const d = item.replace(/\D/g, "").slice(0, 3);
      if (d.length === 3) {
        const n = parseInt(d, 10);
        if (Number.isFinite(n) && n >= 200 && n <= 999) out.push(n);
      }
    }
  }
  const uniq = [...new Set(out)];
  return uniq.length > 0 ? uniq : undefined;
}

export async function POST(req: Request) {
  const gate = await requireAdminApiSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const areaCode = typeof body.areaCode === "string" ? body.areaCode : "";
  const contains = typeof body.contains === "string" ? body.contains : "";
  const locality = typeof body.locality === "string" ? body.locality : "";
  const region = typeof body.region === "string" ? body.region : "";
  const requireSms = body.requireSms !== false;
  const requireVoice = body.requireVoice !== false;
  const requireMms = body.requireMms === true;
  const numberTypeRaw = typeof body.numberType === "string" ? body.numberType.trim().toLowerCase() : "local";
  const numberType = numberTypeRaw === "toll_free" ? "toll_free" : "local";
  const limitRaw = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const limit = Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 30;

  const areaCodesParsed =
    numberType === "local" ? parseAreaCodesFromBody(body) : undefined;

  if (!requireSms && !requireVoice && !requireMms) {
    return NextResponse.json(
      { error: "Select at least one capability filter (SMS, Voice, or MMS)." },
      { status: 400 }
    );
  }

  const result = await searchAvailableTwilioNumbers({
    areaCode: areaCode || null,
    areaCodes: areaCodesParsed ?? null,
    contains: contains || null,
    locality: locality || null,
    region: region || null,
    requireSms,
    requireVoice,
    requireMms,
    numberType,
    limit,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, numbers: result.numbers });
}
