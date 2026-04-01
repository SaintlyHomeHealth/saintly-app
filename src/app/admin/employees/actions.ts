"use server";

import { redirect } from "next/navigation";

import {
  type EmployeeDirectorySegment,
  type EmployeeDirectorySortDir,
  type EmployeeDirectorySortKey,
  filterEmployeeDirectoryRows,
  loadEmployeeDirectoryRows,
} from "@/lib/admin/employee-directory-data";
import { sendEmployeeCredentialReminderSms } from "@/lib/admin/employee-credential-reminder-sms";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const BULK_REMINDER_MAX = 30;

function isSegment(v: string): v is EmployeeDirectorySegment {
  return (
    v === "all" ||
    v === "active" ||
    v === "inactive" ||
    v === "in_process" ||
    v === "due_soon" ||
    v === "missing_credentials" ||
    v === "expired" ||
    v === "annuals_due" ||
    v === "ready_to_activate" ||
    v === "activation_blocked"
  );
}

function isSortKey(v: string): v is EmployeeDirectorySortKey {
  return v === "name" || v === "status" || v === "updated" || v === "readiness" || v === "flags";
}

function isSortDir(v: string): v is EmployeeDirectorySortDir {
  return v === "asc" || v === "desc";
}

function readDirectoryContext(formData: FormData): {
  segment: EmployeeDirectorySegment;
  q: string;
  sort: EmployeeDirectorySortKey;
  dir: EmployeeDirectorySortDir;
} {
  const segmentRaw = String(formData.get("segment") ?? "").trim();
  const segment: EmployeeDirectorySegment =
    segmentRaw && isSegment(segmentRaw) ? segmentRaw : "all";
  const q = String(formData.get("q") ?? "").trim();
  const sortRaw = String(formData.get("sort") ?? "").trim();
  const sort: EmployeeDirectorySortKey = sortRaw && isSortKey(sortRaw) ? sortRaw : "updated";
  const dirRaw = String(formData.get("dir") ?? "").trim();
  const dir: EmployeeDirectorySortDir = dirRaw && isSortDir(dirRaw) ? dirRaw : "desc";
  return { segment, q, sort, dir };
}

function redirectEmployeesWithParams(
  notice: Record<string, string>,
  ctx: ReturnType<typeof readDirectoryContext>
) {
  const qs = new URLSearchParams(notice);
  if (ctx.segment !== "all") qs.set("segment", ctx.segment);
  if (ctx.q) qs.set("q", ctx.q);
  if (ctx.sort !== "updated" || ctx.dir !== "desc") {
    qs.set("sort", ctx.sort);
    qs.set("dir", ctx.dir);
  }
  redirect(`/admin/employees?${qs.toString()}`);
}

export async function sendRowCredentialRemindersAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const ctx = readDirectoryContext(formData);
  const applicantId = String(formData.get("applicantId") ?? "").trim();
  if (!applicantId) {
    redirectEmployeesWithParams({ credentialSmsErr: "Missing applicant" }, ctx);
  }

  const result = await sendEmployeeCredentialReminderSms({
    applicantId,
    staffUserId: staff.user_id,
  });

  if (result.ok) {
    redirectEmployeesWithParams(
      {
        credentialSmsOk: "1",
        credentialSmsSent: String(result.sent),
        credentialSmsDup: String(result.skippedDuplicate),
      },
      ctx
    );
  } else {
    redirectEmployeesWithParams({ credentialSmsErr: result.error.slice(0, 400) }, ctx);
  }
}

export async function sendBulkCredentialRemindersForFilterAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const ctx = readDirectoryContext(formData);
  const { segment, q, sort, dir } = ctx;

  const { rows: allRows, loadError } = await loadEmployeeDirectoryRows();
  if (loadError) {
    redirectEmployeesWithParams({ credentialSmsErr: loadError.slice(0, 400) }, ctx);
  }

  const filtered = filterEmployeeDirectoryRows(allRows, segment, q, sort, dir);
  const candidates = filtered
    .filter((r) => r.credentialReminderTargetCount > 0)
    .slice(0, BULK_REMINDER_MAX);

  let sentEmployees = 0;
  let sentItems = 0;
  let skippedDup = 0;
  const errors: string[] = [];

  for (const row of candidates) {
    const result = await sendEmployeeCredentialReminderSms({
      applicantId: row.applicant.id,
      staffUserId: staff.user_id,
    });
    if (result.ok) {
      sentEmployees += 1;
      sentItems += result.sent;
      skippedDup += result.skippedDuplicate;
    } else if (
      !result.error.includes("Reminders already sent") &&
      !result.error.includes("No due, expired")
    ) {
      errors.push(`${row.nameDisplay}: ${result.error}`);
    }
  }

  redirectEmployeesWithParams(
    {
      credentialSmsBulk: "1",
      bulkEmployees: String(sentEmployees),
      bulkItems: String(sentItems),
      bulkSkippedDup: String(skippedDup),
      bulkScanned: String(candidates.length),
      ...(errors.length > 0 ? { credentialSmsErr: errors.join(" | ").slice(0, 500) } : {}),
    },
    ctx
  );
}
