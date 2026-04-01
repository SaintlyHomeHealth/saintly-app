import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueNotificationIntent } from "@/lib/notifications/outbox";

type ComplianceEventRow = {
  id: string;
  applicant_id: string;
  event_type: string | null;
  event_title: string | null;
  due_date: string | null;
  reminder_date: string | null;
  status: string | null;
  completed_at: string | null;
};

/** Matches admin compliance UI: completed_at or status completed/complete. */
function isComplianceEventCompleted(event: ComplianceEventRow): boolean {
  if (event.completed_at) return true;
  const s = (event.status || "").toLowerCase().trim();
  return s === "completed" || s === "complete";
}

const SOURCE = "annual_compliance_reminder";

/**
 * Enqueue one pending outbox intent per open compliance event whose reminder_date
 * is on or before "now" (UTC). Dedupe: one row per compliance event id (lifetime).
 */
export async function enqueueAnnualComplianceReminderIntents(
  supabase: SupabaseClient
): Promise<{ scanned: number; enqueued: number }> {
  const nowIso = new Date().toISOString();

  const { data: events, error } = await supabase
    .from("admin_compliance_events")
    .select(
      "id, applicant_id, event_type, event_title, due_date, reminder_date, status, completed_at"
    )
    .not("reminder_date", "is", null)
    .lte("reminder_date", nowIso);

  if (error) {
    throw error;
  }

  const rows = (events || []) as ComplianceEventRow[];
  const open = rows.filter((e) => !isComplianceEventCompleted(e));

  let enqueued = 0;
  for (const e of open) {
    const { inserted } = await enqueueNotificationIntent(supabase, {
      source: SOURCE,
      dedupeKey: `${SOURCE}:${e.id}`,
      recipientKind: "internal_digest",
      payload: {
        compliance_event_id: e.id,
        applicant_id: e.applicant_id,
        event_type: e.event_type,
        event_title: e.event_title,
        due_date: e.due_date,
        reminder_date: e.reminder_date,
      },
    });
    if (inserted) enqueued += 1;
  }

  return { scanned: open.length, enqueued };
}

export { SOURCE as ANNUAL_COMPLIANCE_REMINDER_SOURCE };
