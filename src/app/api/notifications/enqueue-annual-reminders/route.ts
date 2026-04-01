import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { enqueueAnnualComplianceReminderIntents } from "@/lib/notifications/enqueue-annual-compliance-reminders";

/**
 * Enqueue-only: scans admin_compliance_events and inserts notification_outbox rows.
 * Call from cron or manually. No email/SMS.
 *
 * Authorization: Authorization: Bearer <NOTIFICATION_ENQUEUE_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.NOTIFICATION_ENQUEUE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "NOTIFICATION_ENQUEUE_SECRET is not configured" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await enqueueAnnualComplianceReminderIntents(supabaseAdmin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[enqueue-annual-reminders]", e);
    return NextResponse.json({ error: "Enqueue failed" }, { status: 500 });
  }
}
