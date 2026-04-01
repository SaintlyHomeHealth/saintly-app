import { NextRequest, NextResponse } from "next/server";

import { runEmployeeCredentialReminderCron } from "@/lib/admin/employee-credential-reminder-cron";

function parseDryRun(req: NextRequest): boolean {
  const q = req.nextUrl.searchParams.get("dry_run") || req.nextUrl.searchParams.get("dryRun");
  if (q === "1" || q === "true") return true;
  return false;
}

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const dedicated = process.env.EMPLOYEE_CREDENTIAL_REMINDER_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (dedicated && auth === `Bearer ${dedicated}`) return true;
  if (vercelCron && auth === `Bearer ${vercelCron}`) return true;
  return false;
}

/**
 * Daily automated employee credential SMS (30d / 7d / expired). Reuses `sendEmployeeCredentialReminderSms` pipeline:
 * `prepareEmployeeCredentialReminderSend` + `commitEmployeeCredentialReminderSend`, same dedupe table.
 *
 * - Scope: same as employee directory — `effectiveEmploymentKey` `active` or `in_process` only (excludes inactive +
 *   pre-hire applicant bucket); excludes missing-credential SMS lines (manual for v1).
 * - Auth: `Authorization: Bearer <EMPLOYEE_CREDENTIAL_REMINDER_CRON_SECRET>` or Vercel `CRON_SECRET`.
 * - Dry run: `?dry_run=1` — no Twilio, no DB inserts; returns projected counts.
 *
 * Vercel Cron issues GET by default; both GET and POST are supported.
 */
async function handle(req: NextRequest) {
  const dedicated = process.env.EMPLOYEE_CREDENTIAL_REMINDER_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (!dedicated && !vercelCron) {
    return NextResponse.json(
      { error: "EMPLOYEE_CREDENTIAL_REMINDER_CRON_SECRET or CRON_SECRET must be configured" },
      { status: 503 }
    );
  }

  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = parseDryRun(req);

  try {
    const result = await runEmployeeCredentialReminderCron({ dryRun });
    const status = result.ok ? 200 : 500;
    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("[send-employee-credential-reminders]", e);
    return NextResponse.json({ error: "Cron failed", ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
