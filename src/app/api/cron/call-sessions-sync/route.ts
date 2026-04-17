import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { expireStaleRingingCallSessions } from "@/lib/phone/call-sessions";

export const runtime = "nodejs";

/**
 * Marks overdue `ringing` rows as `missed` and optionally deactivates stale devices.
 *
 * Authorization: `Authorization: Bearer <CALL_SESSIONS_SYNC_CRON_SECRET>`
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CALL_SESSIONS_SYNC_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CALL_SESSIONS_SYNC_CRON_SECRET is not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const staleDaysRaw = process.env.DEVICE_STALE_DAYS?.trim();
    const staleDays =
      staleDaysRaw && /^\d+$/.test(staleDaysRaw) ? Math.min(90, Math.max(7, Number.parseInt(staleDaysRaw, 10))) : 14;

    const expire = await expireStaleRingingCallSessions(supabaseAdmin);

    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
    const { error: devErr } = await supabaseAdmin
      .from("devices")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .lt("last_seen_at", cutoff)
      .eq("is_active", true);

    if (devErr) {
      console.warn("[cron/call-sessions-sync] devices stale mark:", devErr.message);
    }

    return NextResponse.json({ ok: true, expiredSessions: expire.updated, deviceStaleDays: staleDays });
  } catch (e) {
    console.error("[cron/call-sessions-sync]", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
