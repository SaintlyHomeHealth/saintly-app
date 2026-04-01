import "server-only";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import {
  commitEmployeeCredentialReminderSend,
  countCredentialReminderTargetsByStage,
  prepareEmployeeCredentialReminderSend,
} from "@/lib/admin/employee-credential-reminder-sms";

export type EmployeeCredentialReminderCronResult = {
  ok: boolean;
  dry_run: boolean;
  scanned: number;
  /** Applicants with ≥1 non-missing SMS-scoped credential issue (before dedupe). */
  eligible: number;
  /** Distinct SMS messages sent (or that would be sent in dry run). */
  sms_batches_sent: number;
  /** Credential lines logged with stage `due_soon_30`. */
  sent_30_day: number;
  /** Credential lines logged with stage `due_soon_7`. */
  sent_7_day: number;
  /** Credential lines logged with stage `expired`. */
  sent_expired: number;
  /** Sum of per-applicant duplicate lines skipped (already in `employee_credential_reminder_sends`). */
  skipped_duplicate: number;
  /** Had automatable issues but no valid E.164 phone. */
  skipped_no_phone: number;
  /** No expiring/expired SMS-scoped issues (cron excludes missing credentials). */
  skipped_no_targets: number;
  /** Had issues and phone, but every line was already reminded for this stage + anchor. */
  skipped_all_duplicates: number;
  errors: Array<{ applicant_id: string; message: string }>;
  error_count: number;
  duration_ms: number;
};

/**
 * Daily automation: `active` + `onboarding` applicants only; same send/dedupe/logging as manual reminders.
 * Omits "missing credential" rows (manual-only for v1).
 */
export async function runEmployeeCredentialReminderCron(input: {
  dryRun: boolean;
}): Promise<EmployeeCredentialReminderCronResult> {
  const start = Date.now();
  const errors: Array<{ applicant_id: string; message: string }> = [];

  let scanned = 0;
  let eligible = 0;
  let sms_batches_sent = 0;
  let sent_30_day = 0;
  let sent_7_day = 0;
  let sent_expired = 0;
  let skipped_duplicate = 0;
  let skipped_no_phone = 0;
  let skipped_no_targets = 0;
  let skipped_all_duplicates = 0;

  const { data: applicants, error: listErr } = await supabaseAdmin
    .from("applicants")
    .select("id")
    .in("status", ["active", "onboarding"])
    .order("created_at", { ascending: false })
    .limit(2500);

  if (listErr) {
    return {
      ok: false,
      dry_run: input.dryRun,
      scanned: 0,
      eligible: 0,
      sms_batches_sent: 0,
      sent_30_day: 0,
      sent_7_day: 0,
      sent_expired: 0,
      skipped_duplicate: 0,
      skipped_no_phone: 0,
      skipped_no_targets: 0,
      skipped_all_duplicates: 0,
      errors: [{ applicant_id: "_", message: listErr.message }],
      error_count: 1,
      duration_ms: Date.now() - start,
    };
  }

  const ids = (applicants || []).map((a) => a.id as string);
  scanned = ids.length;

  let didCommit = false;

  for (const applicantId of ids) {
    try {
      const prep = await prepareEmployeeCredentialReminderSend(applicantId, { excludeMissing: true });
      if (!prep.ok) {
        errors.push({ applicant_id: applicantId, message: prep.error });
        continue;
      }

      skipped_duplicate += prep.skippedDuplicate;

      if (prep.rawTargets.length === 0) {
        skipped_no_targets += 1;
        continue;
      }

      eligible += 1;

      if (!prep.e164) {
        skipped_no_phone += 1;
        continue;
      }

      if (prep.targetsToSend.length === 0) {
        skipped_all_duplicates += 1;
        continue;
      }

      const counts = countCredentialReminderTargetsByStage(prep.targetsToSend);

      if (input.dryRun) {
        sms_batches_sent += 1;
        sent_30_day += counts.sent_30_day;
        sent_7_day += counts.sent_7_day;
        sent_expired += counts.sent_expired;
        continue;
      }

      const result = await commitEmployeeCredentialReminderSend({
        applicantId,
        firstName: prep.firstName,
        e164: prep.e164,
        targets: prep.targetsToSend,
        staffUserId: null,
        trigger: "cron",
        skipRevalidate: true,
      });

      if (!result.ok) {
        errors.push({ applicant_id: applicantId, message: result.error });
        continue;
      }

      didCommit = true;
      sms_batches_sent += 1;
      sent_30_day += counts.sent_30_day;
      sent_7_day += counts.sent_7_day;
      sent_expired += counts.sent_expired;
    } catch (e) {
      errors.push({
        applicant_id: applicantId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!input.dryRun && didCommit) {
    revalidatePath("/admin/employees");
  }

  console.log(
    `[employee-credential-reminder-cron] dry_run=${input.dryRun} scanned=${scanned} eligible=${eligible} batches=${sms_batches_sent} 30d=${sent_30_day} 7d=${sent_7_day} exp=${sent_expired} dup_lines=${skipped_duplicate} no_phone=${skipped_no_phone} no_targets=${skipped_no_targets} all_dup=${skipped_all_duplicates} errors=${errors.length} ms=${Date.now() - start}`
  );

  return {
    ok: true,
    dry_run: input.dryRun,
    scanned,
    eligible,
    sms_batches_sent,
    sent_30_day,
    sent_7_day,
    sent_expired,
    skipped_duplicate,
    skipped_no_phone,
    skipped_no_targets,
    skipped_all_duplicates,
    errors: errors.slice(0, 50),
    error_count: errors.length,
    duration_ms: Date.now() - start,
  };
}
