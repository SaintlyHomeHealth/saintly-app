"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLog } from "@/lib/audit-log";

import {
  EMPLOYEE_DIRECTORY_DEFAULT_PAGE_SIZE,
  EMPLOYEE_DIRECTORY_MAX_PAGE_SIZE,
  filterEmployeeDirectoryRows,
  loadEmployeeDirectoryRows,
  type EmployeeDirectorySegment,
  type EmployeeDirectorySortDir,
  type EmployeeDirectorySortKey,
} from "@/lib/admin/employee-directory-data";
import { sendEmployeeCredentialReminderSms } from "@/lib/admin/employee-credential-reminder-sms";
import { sendOnboardingInvite, resendOnboardingInvite } from "@/lib/admin/onboarding-invite";
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
  page: number;
  pageSize: number;
} {
  const segmentRaw = String(formData.get("segment") ?? "").trim();
  const segment: EmployeeDirectorySegment =
    segmentRaw && isSegment(segmentRaw) ? segmentRaw : "all";
  const q = String(formData.get("q") ?? "").trim();
  const sortRaw = String(formData.get("sort") ?? "").trim();
  const sort: EmployeeDirectorySortKey = sortRaw && isSortKey(sortRaw) ? sortRaw : "updated";
  const dirRaw = String(formData.get("dir") ?? "").trim();
  const dir: EmployeeDirectorySortDir = dirRaw && isSortDir(dirRaw) ? dirRaw : "desc";
  const pageParsed = parseInt(String(formData.get("page") ?? "1"), 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;
  const pageSizeParsed = parseInt(String(formData.get("page_size") ?? ""), 10);
  const pageSize =
    Number.isFinite(pageSizeParsed) && pageSizeParsed > 0
      ? Math.min(EMPLOYEE_DIRECTORY_MAX_PAGE_SIZE, pageSizeParsed)
      : EMPLOYEE_DIRECTORY_DEFAULT_PAGE_SIZE;
  return { segment, q, sort, dir, page, pageSize };
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
  if (ctx.page > 1) qs.set("page", String(ctx.page));
  if (ctx.pageSize !== EMPLOYEE_DIRECTORY_DEFAULT_PAGE_SIZE) qs.set("page_size", String(ctx.pageSize));
  redirect(`/admin/employees?${qs.toString()}`);
}

function readTrimmedField(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function sanitizeInternalReturnTo(raw: string): string | null {
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function redirectWithInviteNotice(
  notice: Record<string, string>,
  ctx: ReturnType<typeof readDirectoryContext>,
  returnTo: string | null
) {
  if (!returnTo) {
    redirectEmployeesWithParams(notice, ctx);
  }

  const [pathname, query = ""] = returnTo.split("?", 2);
  const qs = new URLSearchParams(query);
  for (const [key, value] of Object.entries(notice)) {
    qs.set(key, value);
  }
  const next = qs.toString() ? `${pathname}?${qs.toString()}` : pathname;
  redirect(next);
}

async function syncRecruitingCandidateAfterInvite(input: {
  candidateId: string;
  applicantId: string;
  staffUserId: string;
}) {
  const candidateId = input.candidateId.trim();
  const applicantId = input.applicantId.trim();
  if (!candidateId || !applicantId) return;

  const noteBody = `Employee onboarding invite sent. Applicant ID: ${applicantId}`;
  const activityRow = {
    candidate_id: candidateId,
    activity_type: "note",
    outcome: null,
    body: noteBody,
    created_by: input.staffUserId,
  };

  let { error: activityErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert(activityRow);
  if (activityErr?.code === "23503" && activityRow.created_by) {
    ({ error: activityErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert({
      ...activityRow,
      created_by: null,
    }));
  }
  if (activityErr) {
    console.warn("[recruiting] sync after onboarding invite activity:", activityErr.message);
  }

  const { error: candidateErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .update({
      status: "Onboarding",
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);

  if (candidateErr) {
    console.warn("[recruiting] sync after onboarding invite status:", candidateErr.message);
  }

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${candidateId}`);
}

export async function archiveEmployeeAction(formData: FormData) {
  const staff = await getStaffProfile();
  const applicantId = readTrimmedField(formData, "applicantId");
  const archiveContextRaw = readTrimmedField(formData, "archiveContext");
  const archiveContext = archiveContextRaw === "detail" ? "detail" : "list";

  const redirectDenied = () => {
    if (archiveContext === "detail" && applicantId) {
      redirect(`/admin/employees/${applicantId}?toast=employee_archive_denied`);
    }
    redirect("/admin/employees?toast=employee_archive_denied");
  };

  if (!staff || !isManagerOrHigher(staff)) {
    redirectDenied();
  }

  if (!applicantId) {
    redirect("/admin/employees?toast=employee_archive_invalid");
  }

  const { data: prior, error: priorErr } = await supabaseAdmin
    .from("applicants")
    .select("id, status")
    .eq("id", applicantId)
    .maybeSingle();

  if (priorErr || prior == null || typeof prior.id !== "string") {
    if (archiveContext === "detail") {
      redirect(`/admin/employees/${applicantId}?toast=employee_archive_gone`);
    }
    const ctx = readDirectoryContext(formData);
    redirectEmployeesWithParams({ toast: "employee_archive_gone" }, ctx);
  }

  const prevStatus = typeof prior.status === "string" ? prior.status : null;

  const { error: updErr } = await supabaseAdmin
    .from("applicants")
    .update({ status: "inactive" })
    .eq("id", applicantId);

  if (updErr) {
    console.warn("[employees] archiveEmployeeAction:", updErr.message);
    if (archiveContext === "detail") {
      redirect(`/admin/employees/${applicantId}?toast=employee_archive_failed`);
    }
    const ctx = readDirectoryContext(formData);
    redirectEmployeesWithParams({ toast: "employee_archive_failed" }, ctx);
  }

  if (prevStatus !== "inactive") {
    await insertAuditLog({
      action: "employee_status_change",
      entityType: "applicant",
      entityId: applicantId,
      metadata: {
        previous_status: prevStatus,
        new_status: "inactive",
        source: "directory_archive",
      },
    });
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${applicantId}`);
  revalidatePath("/admin");

  if (archiveContext === "detail") {
    redirect(`/admin/employees/${applicantId}?toast=employee_archived`);
  }

  const ctx = readDirectoryContext(formData);
  redirectEmployeesWithParams({ toast: "employee_archived" }, ctx);
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

export async function submitAddEmployeeInviteAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const ctx = readDirectoryContext(formData);
  const returnTo = sanitizeInternalReturnTo(readTrimmedField(formData, "returnTo"));
  const recruitingCandidateId = readTrimmedField(formData, "recruitingCandidateId");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const channelRaw = String(formData.get("channel") ?? "").trim();

  if (channelRaw !== "sms" && channelRaw !== "email" && channelRaw !== "both") {
    redirectWithInviteNotice({ inviteErr: "Choose text, email, or both." }, ctx, returnTo);
  }
  const channel = channelRaw as "sms" | "email" | "both";

  const result = await sendOnboardingInvite({
    firstName,
    lastName,
    email,
    phone,
    role,
    channel,
    staffUserId: staff.user_id,
  });

  if (result.ok) {
    if (recruitingCandidateId) {
      await syncRecruitingCandidateAfterInvite({
        candidateId: recruitingCandidateId,
        applicantId: result.applicantId,
        staffUserId: staff.user_id,
      });
    }

    redirectWithInviteNotice(
      {
        inviteOk: "1",
        inviteApplicantId: result.applicantId,
        ...(result.emailFailureReason
          ? { inviteEmailWarn: result.emailFailureReason.slice(0, 400) }
          : {}),
      },
      ctx,
      returnTo
    );
  } else {
    redirectWithInviteNotice({ inviteErr: result.error.slice(0, 400) }, ctx, returnTo);
  }
}

function redirectEmployeeDetailWithInviteNotice(
  applicantId: string,
  notice: Record<string, string>
) {
  const qs = new URLSearchParams(notice);
  redirect(`/admin/employees/${applicantId}?${qs.toString()}`);
}

export async function resendOnboardingInviteSmsAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }
  const applicantId = String(formData.get("applicantId") ?? "").trim();
  if (!applicantId) {
    redirect("/admin/employees");
  }
  const result = await resendOnboardingInvite({
    applicantId,
    channel: "sms",
    staffUserId: staff.user_id,
  });
  if (!result.ok) {
    redirectEmployeeDetailWithInviteNotice(applicantId, { inviteErr: result.error.slice(0, 400) });
  }
  redirectEmployeeDetailWithInviteNotice(applicantId, { inviteOk: "sms" });
}

export async function resendOnboardingInviteEmailAction(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }
  const applicantId = String(formData.get("applicantId") ?? "").trim();
  if (!applicantId) {
    redirect("/admin/employees");
  }
  const result = await resendOnboardingInvite({
    applicantId,
    channel: "email",
    staffUserId: staff.user_id,
  });
  if (!result.ok) {
    redirectEmployeeDetailWithInviteNotice(applicantId, { inviteErr: result.error.slice(0, 400) });
  }
  redirectEmployeeDetailWithInviteNotice(applicantId, { inviteOk: "email" });
}
