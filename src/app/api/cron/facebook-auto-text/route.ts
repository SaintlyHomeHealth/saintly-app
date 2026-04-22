import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { processDueFacebookAutoTextLeads } from "@/lib/facebook/facebook-lead-intro-sms";

export const runtime = "nodejs";

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const dedicated = process.env.FACEBOOK_AUTO_TEXT_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (dedicated && auth === `Bearer ${dedicated}`) return true;
  if (vercelCron && auth === `Bearer ${vercelCron}`) return true;
  return false;
}

/**
 * Sends queued Facebook intro SMS when `auto_text_scheduled_at` is due (America/Phoenix business hours
 * enforced inside the worker — after-hours runs requeue for the next 8:00 open).
 *
 * Auth: `Authorization: Bearer <FACEBOOK_AUTO_TEXT_CRON_SECRET>` or Vercel `CRON_SECRET`.
 * Vercel Cron uses GET; GET and POST are both supported.
 */
async function handle(req: NextRequest) {
  const dedicated = process.env.FACEBOOK_AUTO_TEXT_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (!dedicated && !vercelCron) {
    return NextResponse.json(
      { error: "FACEBOOK_AUTO_TEXT_CRON_SECRET or CRON_SECRET must be configured" },
      { status: 503 }
    );
  }

  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { processed } = await processDueFacebookAutoTextLeads(supabaseAdmin);
    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    console.error("[cron/facebook-auto-text]", e);
    return NextResponse.json({ ok: false, error: "Cron failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
