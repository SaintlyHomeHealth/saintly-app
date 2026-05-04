import { sendOutboundSmsForPatient, type OutboundSmsRecipient } from "@/lib/crm/outbound-patient-sms";
import { supabaseAdmin } from "@/lib/admin";

type VisitRow = {
  id: string;
  patient_id: string;
  scheduled_for: string | null;
  status: string | null;
  reminder_recipient: string | null;
  reminder_day_before_sent_at: string | null;
  reminder_day_of_sent_at: string | null;
};

function formatYmdInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function hourInTimeZone(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  return h ? parseInt(h, 10) : 0;
}

function formatVisitTimeHuman(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function parseRecipient(raw: string | null): OutboundSmsRecipient {
  if (raw === "caregiver" || raw === "both" || raw === "patient") return raw;
  return "patient";
}

/**
 * Sends automated visit reminders using `patient_visits` + contact phones.
 * Idempotent via `reminder_day_before_sent_at` / `reminder_day_of_sent_at`.
 *
 * Day-before: first run after the visit is within 24h but on a **future calendar day** (not same-day visits).
 * Day-of: same local calendar day as the visit, 8am–3pm local window, visit still in the future.
 */
export async function runVisitReminderCron(opts?: { timeZone?: string }): Promise<{
  dayBeforeSent: number;
  dayOfSent: number;
  skipped: number;
  errors: string[];
}> {
  const tz = (opts?.timeZone ?? process.env.VISIT_REMINDER_TIMEZONE)?.trim() || "America/Phoenix";
  const errors: string[] = [];
  let dayBeforeSent = 0;
  let dayOfSent = 0;
  let skipped = 0;

  const { data: rows, error } = await supabaseAdmin
    .from("patient_visits")
    .select(
      "id, patient_id, scheduled_for, status, reminder_recipient, reminder_day_before_sent_at, reminder_day_of_sent_at"
    )
    .in("status", ["scheduled", "confirmed"])
    .not("scheduled_for", "is", null);

  if (error) {
    return { dayBeforeSent: 0, dayOfSent: 0, skipped: 0, errors: [error.message] };
  }

  const now = new Date();

  for (const raw of rows ?? []) {
    const row = raw as VisitRow;
    const scheduledFor = typeof row.scheduled_for === "string" ? row.scheduled_for : null;
    if (!scheduledFor) {
      skipped++;
      continue;
    }

    const sf = new Date(scheduledFor);
    if (Number.isNaN(sf.getTime()) || sf <= now) {
      skipped++;
      continue;
    }

    const msUntil = sf.getTime() - now.getTime();
    const hoursUntil = msUntil / (1000 * 60 * 60);
    const visitDay = formatYmdInTimeZone(sf, tz);
    const todayDay = formatYmdInTimeZone(now, tz);
    const recipient = parseRecipient(row.reminder_recipient);

    if (!row.reminder_day_before_sent_at && visitDay !== todayDay && hoursUntil <= 24 && hoursUntil > 0) {
      const body = `Reminder — Saintly Home Health: you have a visit scheduled for ${formatVisitTimeHuman(scheduledFor, tz)}. Reply if you need to reschedule.`;
      const r = await sendOutboundSmsForPatient(row.patient_id, body, recipient);
      if (r.ok) {
        const { error: uErr } = await supabaseAdmin
          .from("patient_visits")
          .update({ reminder_day_before_sent_at: new Date().toISOString() })
          .eq("id", row.id);
        if (uErr) errors.push(`${row.id} day_before update: ${uErr.message}`);
        else dayBeforeSent++;
      } else {
        errors.push(`${row.id} day_before send: ${r.error}`);
      }
      continue;
    }

    if (!row.reminder_day_of_sent_at && visitDay === todayDay && sf > now) {
      const hour = hourInTimeZone(now, tz);
      if (hour < 8 || hour >= 15) {
        skipped++;
        continue;
      }
      const body = `Today — your Saintly Home Health visit is scheduled for ${formatVisitTimeHuman(scheduledFor, tz)}. We're looking forward to seeing you.`;
      const r = await sendOutboundSmsForPatient(row.patient_id, body, recipient);
      if (r.ok) {
        const { error: uErr } = await supabaseAdmin
          .from("patient_visits")
          .update({ reminder_day_of_sent_at: new Date().toISOString() })
          .eq("id", row.id);
        if (uErr) errors.push(`${row.id} day_of update: ${uErr.message}`);
        else dayOfSent++;
      } else {
        errors.push(`${row.id} day_of send: ${r.error}`);
      }
      continue;
    }

    skipped++;
  }

  return { dayBeforeSent, dayOfSent, skipped, errors };
}
