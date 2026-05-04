import { NextRequest, NextResponse } from "next/server";

import { runVisitReminderCron } from "@/lib/crm/visit-reminder-cron";

/**
 * Automated SMS reminders for scheduled `patient_visits` (day-before + day-of).
 *
 * Authorization: `Authorization: Bearer <VISIT_REMINDER_CRON_SECRET>`
 * Schedule: e.g. hourly via Vercel cron or external scheduler.
 *
 * Env: `VISIT_REMINDER_CRON_SECRET` (required), optional `VISIT_REMINDER_TIMEZONE` (default America/Phoenix).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.VISIT_REMINDER_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "VISIT_REMINDER_CRON_SECRET is not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tz = process.env.VISIT_REMINDER_TIMEZONE?.trim();
    const result = await runVisitReminderCron(tz ? { timeZone: tz } : undefined);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/visit-reminders]", e);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
