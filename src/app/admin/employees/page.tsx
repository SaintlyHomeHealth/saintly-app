import Link from "next/link";
import { redirect } from "next/navigation";

import AddEmployeeInviteButton from "@/app/admin/employees/add-employee-invite-button";
import { EmployeeArchiveButton } from "@/app/admin/employees/EmployeeArchiveButton";
import {
  sendBulkCredentialRemindersForFilterAction,
  sendRowCredentialRemindersAction,
} from "@/app/admin/employees/actions";
import { CredentialReminderSubmitButton } from "@/app/admin/employees/credential-reminder-submit";
import {
  complianceDirectoryItemHref,
  complianceFlagHref,
  isEmployeeDirectoryItemKey,
  readinessSummaryHref,
} from "@/lib/admin/employee-directory-deep-links";
import {
  type EmployeeDirectorySegment,
  type EmployeeDirectorySortDir,
  type EmployeeDirectorySortKey,
  complianceItemPillClass,
  filterEmployeeDirectoryRows,
  loadEmployeeDirectoryRows,
} from "@/lib/admin/employee-directory-data";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  buildAdminPhoneCallsSoftphoneHref,
  buildWorkspaceKeypadCallHref,
} from "@/lib/workspace-phone/launch-urls";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  isManagerOrHigher,
  isPhoneWorkspaceUser,
  type StaffProfile,
} from "@/lib/staff-profile";

const SEGMENTS: { value: EmployeeDirectorySegment; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "in_process", label: "In process" },
  { value: "inactive", label: "Inactive" },
  { value: "due_soon", label: "Due soon" },
  { value: "missing_credentials", label: "Missing credentials" },
  { value: "expired", label: "Expired" },
  { value: "annuals_due", label: "Annuals due" },
  { value: "ready_to_activate", label: "Ready to activate" },
  { value: "activation_blocked", label: "Activation blocked" },
];

function isSegment(v: string): v is EmployeeDirectorySegment {
  return SEGMENTS.some((s) => s.value === v);
}

function isSortKey(v: string): v is EmployeeDirectorySortKey {
  return (
    v === "name" ||
    v === "status" ||
    v === "updated" ||
    v === "readiness" ||
    v === "flags"
  );
}

function isSortDir(v: string): v is EmployeeDirectorySortDir {
  return v === "asc" || v === "desc";
}

function employeeDirectoryCallHref(
  profile: StaffProfile,
  e164: string | null,
  contextName: string
): string | null {
  if (!e164 || !isPhoneWorkspaceUser(profile)) return null;
  if (canAccessWorkspacePhone(profile)) {
    return buildWorkspaceKeypadCallHref({ dial: e164, contextName, placeCall: true });
  }
  return buildAdminPhoneCallsSoftphoneHref({ dial: e164, placeCall: true });
}

function buildQuery(sp: {
  segment: EmployeeDirectorySegment;
  q: string;
  sort: EmployeeDirectorySortKey;
  dir: EmployeeDirectorySortDir;
}): string {
  const u = new URLSearchParams();
  if (sp.segment !== "all") u.set("segment", sp.segment);
  if (sp.q.trim()) u.set("q", sp.q.trim());
  if (sp.sort !== "updated" || sp.dir !== "desc") {
    u.set("sort", sp.sort);
    u.set("dir", sp.dir);
  }
  const qs = u.toString();
  return qs ? `?${qs}` : "";
}

function stagePillClass(tone: string): string {
  switch (tone) {
    case "green":
      return "border border-green-200 bg-green-50 text-green-800";
    case "amber":
      return "border border-amber-200 bg-amber-50 text-amber-900";
    case "violet":
      return "border border-violet-200 bg-violet-50 text-violet-900";
    case "sky":
      return "border border-sky-200 bg-sky-50 text-sky-900";
    case "red":
      return "border border-red-200 bg-red-50 text-red-800";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

const flagBadge =
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide";

export default async function AdminEmployeesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const raw = await searchParams;
  const one = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };

  const segmentRaw = one("segment").trim();
  const segment: EmployeeDirectorySegment =
    segmentRaw && isSegment(segmentRaw) ? segmentRaw : "all";
  const q = one("q").trim();

  const sortRaw = one("sort").trim();
  const sort: EmployeeDirectorySortKey = sortRaw && isSortKey(sortRaw) ? sortRaw : "updated";

  const dirRaw = one("dir").trim();
  const dir: EmployeeDirectorySortDir = dirRaw && isSortDir(dirRaw) ? dirRaw : "desc";

  const { rows: allRows, loadError } = await loadEmployeeDirectoryRows();
  const filtered = filterEmployeeDirectoryRows(allRows, segment, q, sort, dir);

  const filterInputCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm";
  const pillBase =
    "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition";

  const itemHeader =
    "px-1 py-2 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-600";

  const smsOk = one("credentialSmsOk").trim();
  const smsErr = one("credentialSmsErr").trim();
  const smsSent = one("credentialSmsSent").trim();
  const smsDup = one("credentialSmsDup").trim();
  const smsBulk = one("credentialSmsBulk").trim();
  const bulkEmployees = one("bulkEmployees").trim();
  const bulkItems = one("bulkItems").trim();
  const bulkSkippedDup = one("bulkSkippedDup").trim();
  const bulkScanned = one("bulkScanned").trim();
  const inviteErr = one("inviteErr").trim();
  const inviteOk = one("inviteOk").trim();
  const inviteEmailWarn = one("inviteEmailWarn").trim();
  const inviteApplicantId = one("inviteApplicantId").trim();
  const toastParam = one("toast").trim();

  const smsBtnBase =
    "rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-950 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="People & compliance"
        title="Employees"
        description={
          <>
            Readiness: credentials, annual programs, onboarding, and activation—same data as the command center.
            Employment reconciles <code className="rounded bg-slate-100 px-1 text-xs">applicants.status</code> with stage{" "}
            <span className="font-medium">Active Employee</span> when forms are finalized. Cells show{" "}
            <span className="font-medium text-emerald-800">OK</span>,{" "}
            <span className="font-medium text-amber-800">due soon (30d)</span>,{" "}
            <span className="font-medium text-slate-700">missing</span>,{" "}
            <span className="font-medium text-red-800">expired</span>, or <span className="text-slate-400">n/a</span>.
            Send manual SMS reminders for expiring credentials (license, CPR, TB, DL, insurance) using the
            employee&apos;s phone on file—Twilio + inbox logging; duplicates blocked per credential, expiration
            snapshot, and stage.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AddEmployeeInviteButton segment={segment} q={q} sort={sort} dir={dir} />
            <Link
              href="/admin"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50"
            >
              Back to Command Center
            </Link>
          </div>
        }
      />

      {inviteErr ? (
        <div
          role="alert"
          className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
        >
          {inviteErr}
        </div>
      ) : null}

      {inviteOk ? (
        <div
          role="status"
          className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm"
        >
          Onboarding invite sent.
          {inviteApplicantId ? (
            <>
              {" "}
              <Link
                href={`/admin/employees/${inviteApplicantId}`}
                prefetch={false}
                className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
              >
                Open employee record
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {inviteEmailWarn ? (
        <div
          role="alert"
          className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
        >
          <span className="font-semibold">Text was sent, but email did not send.</span> {inviteEmailWarn}
        </div>
      ) : null}

      {smsErr ? (
        <div
          role="alert"
          className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
        >
          {smsErr}
        </div>
      ) : null}
      {smsOk === "1" ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          Credential SMS sent for {smsSent || "0"} item(s).
          {smsDup && Number(smsDup) > 0 ? (
            <span className="block text-xs text-emerald-800">
              {smsDup} item(s) were already reminded (skipped duplicate).
            </span>
          ) : null}
        </div>
      ) : null}
      {smsBulk === "1" ? (
        <div className="rounded-[20px] border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 shadow-sm">
          Bulk credential SMS finished: {bulkEmployees || "0"} employee(s), {bulkItems || "0"} credential line(s) in
          messages, {bulkSkippedDup || "0"} duplicate line(s) skipped. Scanned {bulkScanned || "0"} eligible rows (max
          30 per run).
        </div>
      ) : null}

      {toastParam === "employee_archived" ? (
        <div
          role="status"
          className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm"
        >
          Employee archived: they no longer appear in the default directory view. Compliance history and records are
          unchanged. Use the <span className="font-semibold">Inactive</span> filter to find them.
        </div>
      ) : toastParam === "employee_archive_denied" ||
          toastParam === "employee_archive_failed" ||
          toastParam === "employee_archive_invalid" ||
          toastParam === "employee_archive_gone" ? (
        <div
          role="alert"
          className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
        >
          {toastParam === "employee_archive_denied"
            ? "You do not have permission to archive employees."
            : toastParam === "employee_archive_gone"
              ? "That employee could not be found."
              : toastParam === "employee_archive_invalid"
                ? "Missing employee id. Refresh and try again."
                : "Could not archive the employee. Try again or check logs."}
        </div>
      ) : null}

      {loadError ? <p className="text-sm text-red-700">Could not load applicants: {loadError}</p> : null}

      <div className="flex flex-wrap gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-3 shadow-sm">
        <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:w-auto sm:py-1.5">
          Quick filters
        </span>
        {SEGMENTS.map((s) => {
          const active = segment === s.value;
          return (
            <Link
              key={s.value}
              href={`/admin/employees${buildQuery({ segment: s.value, q, sort, dir })}`}
              className={`${pillBase} ${
                active
                  ? "border-indigo-400 bg-indigo-50 text-indigo-950"
                  : "border-slate-200 bg-white text-slate-700 hover:border-indigo-200"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      <form
        method="get"
        action="/admin/employees"
        className="flex flex-wrap items-end gap-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
      >
        {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
        <label className="flex min-w-[12rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search name, email, phone, role
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="e.g. Smith, @saintly, 602…"
            className={`${filterInputCls} min-w-[14rem]`}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Sort by
          <select name="sort" defaultValue={sort} className={`${filterInputCls} min-w-[11rem]`}>
            <option value="updated">Last updated</option>
            <option value="readiness">Readiness severity</option>
            <option value="flags">Flag / blocker density</option>
            <option value="name">Name</option>
            <option value="status">Employment status</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Order
          <select name="dir" defaultValue={dir} className={filterInputCls}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-indigo-600 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
        >
          Apply
        </button>
        <Link
          href="/admin/employees"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      <form
        action={sendBulkCredentialRemindersForFilterAction}
        className="flex flex-col gap-2 rounded-[20px] border border-violet-200 bg-violet-50/50 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <input type="hidden" name="segment" value={segment} />
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <p className="max-w-2xl text-xs text-violet-950">
          <span className="font-semibold">Bulk credential SMS:</span> texts up to 30 employees in the{" "}
          <span className="font-medium">current filter</span> who have at least one SMS-scoped credential missing,
          expired, or due within 30 days. Skips anyone with nothing to send or only duplicates already logged.
        </p>
        <CredentialReminderSubmitButton
          className="inline-flex shrink-0 items-center justify-center rounded-[18px] border border-violet-600 bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
        >
          Send bulk SMS (filtered)
        </CredentialReminderSubmitButton>
      </form>

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1780px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                Name
              </th>
              <th className="px-2 py-3">Employment</th>
              <th className="px-2 py-3">Stage</th>
              <th className="whitespace-nowrap px-2 py-3">Onboarding</th>
              <th className="px-2 py-3">Readiness</th>
              <th className="min-w-[9rem] px-2 py-3">Flags</th>
              <th
                className="border-l border-slate-200 bg-slate-100/80 px-0 py-0 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500"
                colSpan={5}
              >
                Credentials
              </th>
              <th
                className="border-l border-slate-200 bg-indigo-50/60 px-0 py-0 text-center text-[10px] font-bold uppercase tracking-wider text-indigo-800"
                colSpan={5}
              >
                Programs &amp; annuals
              </th>
              <th className="px-2 py-3">Updated</th>
              <th className="px-2 py-3">Email</th>
              <th className="px-2 py-3">Phone</th>
              <th className="whitespace-nowrap px-2 py-3">SMS cred</th>
              <th className="whitespace-nowrap px-2 py-3">Actions</th>
            </tr>
            <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50/90 px-3 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className={itemHeader}>Lic</th>
              <th className={itemHeader}>CPR</th>
              <th className={itemHeader}>TB</th>
              <th className={itemHeader}>DL</th>
              <th className={itemHeader}>Ins</th>
              <th className={`${itemHeader} border-l border-slate-200`}>Skills</th>
              <th className={itemHeader}>Perf</th>
              <th className={itemHeader}>TB yr</th>
              <th className={itemHeader}>Train</th>
              <th className={itemHeader}>Rev</th>
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={21} className="px-4 py-10 text-center text-sm text-slate-500">
                  No rows match the current filters. Adjust segment or search, or confirm applicants exist in Supabase.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const id = r.applicant.id;
                const callHref = employeeDirectoryCallHref(staff, r.e164, r.nameDisplay);
                const updatedLabel =
                  r.lastUpdatedMs > 0
                    ? new Date(r.lastUpdatedMs).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—";

                const byKey = Object.fromEntries(r.complianceItems.map((i) => [i.key, i])) as Record<
                  string,
                  (typeof r.complianceItems)[0]
                >;

                const itemCellHref = (key: string) =>
                  isEmployeeDirectoryItemKey(key)
                    ? complianceDirectoryItemHref(id, key, r.requiredCredentialTypes)
                    : `/admin/employees/${id}#credentials-section`;

                const itemCell = (key: string) => {
                  const it = byKey[key];
                  const href = itemCellHref(key);
                  if (!it) {
                    return (
                      <td className="px-0.5 py-1.5 text-center">
                        <Link
                          href={href}
                          prefetch={false}
                          className="inline-block min-w-[1.75rem] rounded border border-slate-100 bg-slate-50 px-1 py-0.5 text-[9px] text-slate-300 transition hover:border-indigo-200 hover:text-indigo-700"
                          title="Open credential area"
                        >
                          —
                        </Link>
                      </td>
                    );
                  }
                  return (
                    <td className="px-0.5 py-1.5 text-center">
                      <Link
                        href={href}
                        prefetch={false}
                        title={it.hint}
                        className={`inline-flex min-w-[1.75rem] justify-center rounded px-1 py-0.5 text-[9px] font-bold transition hover:ring-2 hover:ring-indigo-300 ${complianceItemPillClass(it.tier)}`}
                      >
                        {it.tier === "ok"
                          ? "✓"
                          : it.tier === "due_soon"
                            ? "!"
                            : it.tier === "missing"
                              ? "−"
                              : it.tier === "expired"
                                ? "×"
                                : "·"}
                      </Link>
                    </td>
                  );
                };

                return (
                  <tr
                    key={id}
                    className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-semibold text-slate-900 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                      <Link
                        href={`/admin/employees/${id}`}
                        prefetch={false}
                        className="text-slate-900 hover:text-indigo-800 hover:underline"
                      >
                        {r.nameDisplay}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.employmentStatusBadgeClass}`}
                      >
                        {r.employmentStatusLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stagePillClass(r.stageTone)}`}
                      >
                        {r.stageLabel}
                      </span>
                    </td>
                    <td className="max-w-[9rem] px-2 py-2">
                      <Link
                        href={`/admin/employees/${id}#onboarding-portal-section`}
                        prefetch={false}
                        title="Open onboarding details"
                        className={`inline-flex max-w-full rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition hover:ring-2 hover:ring-indigo-300 ${r.onboardingTrackBadgeClass}`}
                      >
                        <span className="truncate">{r.onboardingTrackLabel}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={readinessSummaryHref(id, {
                          commandComplianceStatus: r.commandComplianceStatus,
                          flagMissingCredential: r.flagMissingCredential,
                          flagExpiredCredential: r.flagExpiredCredential,
                          flagAnnualDue: r.flagAnnualDue,
                          flagActivationBlocked: r.flagActivationBlocked,
                          flagOnboardingIncomplete: r.flagOnboardingIncomplete,
                        })}
                        prefetch={false}
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition hover:ring-2 hover:ring-indigo-300 ${r.commandComplianceBadgeClass}`}
                      >
                        {r.commandComplianceLabel}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex max-w-[9.5rem] flex-wrap gap-1">
                        {r.flagMissingCredential ? (
                          <Link
                            href={complianceFlagHref(id, "miss_cred")}
                            prefetch={false}
                            className={`${flagBadge} border-red-200 bg-red-50 text-red-800 transition hover:ring-2 hover:ring-red-300`}
                            title="Required credential missing on file"
                          >
                            Miss cred
                          </Link>
                        ) : null}
                        {r.flagExpiringSoon ? (
                          <Link
                            href={complianceFlagHref(id, "due_30d")}
                            prefetch={false}
                            className={`${flagBadge} border-amber-200 bg-amber-50 text-amber-900 transition hover:ring-2 hover:ring-amber-300`}
                            title="Credential or annual due within 30 days"
                          >
                            Due 30d
                          </Link>
                        ) : null}
                        {r.flagAnnualDue ? (
                          <Link
                            href={complianceFlagHref(id, "annual")}
                            prefetch={false}
                            className={`${flagBadge} border-violet-200 bg-violet-50 text-violet-900 transition hover:ring-2 hover:ring-violet-300`}
                            title="Annual program missing, due, or overdue"
                          >
                            Annual
                          </Link>
                        ) : null}
                        {r.flagOnboardingIncomplete ? (
                          <Link
                            href={complianceFlagHref(id, "onboard")}
                            prefetch={false}
                            className={`${flagBadge} border-sky-200 bg-sky-50 text-sky-900 transition hover:ring-2 hover:ring-sky-300`}
                            title="Onboarding file incomplete (app, docs, contracts, training, or tax)"
                          >
                            Onboard
                          </Link>
                        ) : null}
                        {r.flagActivationBlocked ? (
                          <Link
                            href={complianceFlagHref(id, "blocked")}
                            prefetch={false}
                            className={`${flagBadge} border-rose-200 bg-rose-50 text-rose-900 transition hover:ring-2 hover:ring-rose-300`}
                            title="Cannot activate: onboarding/applicant with blocking gaps"
                          >
                            Blocked
                          </Link>
                        ) : null}
                        {!r.flagMissingCredential &&
                        !r.flagExpiringSoon &&
                        !r.flagAnnualDue &&
                        !r.flagOnboardingIncomplete &&
                        !r.flagActivationBlocked ? (
                          <span className="text-[10px] text-slate-400">—</span>
                        ) : null}
                      </div>
                    </td>
                    {itemCell("professional_license")}
                    {itemCell("cpr")}
                    {itemCell("tb_expiration")}
                    {itemCell("drivers_license")}
                    {itemCell("insurance")}
                    {itemCell("skills")}
                    {itemCell("performance")}
                    {itemCell("annual_tb_stmt")}
                    {itemCell("annual_train")}
                    {itemCell("annual_contract_rev")}
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">{updatedLabel}</td>
                    <td className="max-w-[10rem] truncate px-2 py-2 text-xs text-slate-600">
                      {r.applicant.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
                      {formatPhoneForDisplay(r.applicant.phone as string | null)}
                    </td>
                    <td className="max-w-[8.5rem] px-2 py-2 align-top">
                      <form action={sendRowCredentialRemindersAction} className="flex flex-col gap-1">
                        <input type="hidden" name="applicantId" value={id} />
                        <input type="hidden" name="segment" value={segment} />
                        <input type="hidden" name="q" value={q} />
                        <input type="hidden" name="sort" value={sort} />
                        <input type="hidden" name="dir" value={dir} />
                        <CredentialReminderSubmitButton
                          className={smsBtnBase}
                          disabled={r.credentialReminderTargetCount === 0 || !r.e164}
                          title={
                            !r.e164
                              ? "No valid mobile on file"
                              : r.credentialReminderTargetCount === 0
                                ? "No SMS-scoped credentials due or expired"
                                : `Send SMS for ${r.credentialReminderTargetCount} credential issue(s)`
                          }
                        >
                          Remind
                        </CredentialReminderSubmitButton>
                        {r.credentialReminderTargetCount > 0 ? (
                          <span className="text-[9px] text-slate-500">{r.credentialReminderTargetCount} to send</span>
                        ) : null}
                      </form>
                      {r.credentialReminderLastSentAt ? (
                        <Link
                          href={`/admin/employees/${id}#credential-reminder-log-section`}
                          prefetch={false}
                          className="mt-1.5 block text-[9px] leading-snug text-slate-500 underline-offset-2 hover:text-indigo-700 hover:underline"
                          title="Open full reminder log on employee record"
                        >
                          Last SMS:{" "}
                          {new Date(r.credentialReminderLastSentAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Link>
                      ) : (
                        <p className="mt-1.5 text-[9px] leading-snug text-slate-400">No reminders logged</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        {r.credentialReminderSentDueSoon30 ? (
                          <span
                            className="rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-900"
                            title="At least one 30-day-window reminder is on file"
                          >
                            30d sent
                          </span>
                        ) : null}
                        {r.credentialReminderSentDueSoon7 ? (
                          <span
                            className="rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-orange-950"
                            title="At least one 7-day-window reminder is on file"
                          >
                            7d sent
                          </span>
                        ) : null}
                        {r.credentialReminderSentExpired ? (
                          <span
                            className="rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-red-900"
                            title="At least one expired reminder is on file"
                          >
                            Exp sent
                          </span>
                        ) : null}
                        {r.credentialReminderSentMissing ? (
                          <span
                            className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-700"
                            title="At least one missing-on-file reminder is on file"
                          >
                            Miss sent
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/admin/employees/${id}`}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100"
                        >
                          Open
                        </Link>
                        {callHref ? (
                          <Link
                            href={callHref}
                            prefetch={false}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                          >
                            Call
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400">No phone</span>
                        )}
                        {r.e164 ? (
                          <Link
                            href={`/admin/phone/messages/new?to=${encodeURIComponent(r.e164)}`}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                          >
                            Text
                          </Link>
                        ) : null}
                        <EmployeeArchiveButton
                          applicantId={id}
                          archiveContext="list"
                          canArchive={r.effectiveEmploymentKey !== "inactive"}
                          directoryFilters={{ segment, q, sort, dir }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600 shadow-sm">
        <p className="font-semibold text-slate-800">Legend</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <span className="font-medium">Sort:</span> Readiness severity ranks missing/expired (2), due soon (1), clear
            (0); <span className="font-medium">descending</span> lists worst readiness first. Flag density sums weights:
            blocked 32, missing cred 16, expired cred 12, annual 8, onboard 4, 30-day 2; descending lists highest
            pressure first. Tie-breakers: the other score, then last updated (for readiness/flags).
          </li>
          <li>
            <span className="font-medium">Readiness</span> rolls up tracked items:{" "}
            <span className="text-red-800">Missing / expired</span> if any required item is missing, expired, or a
            credential is overdue; else <span className="text-amber-800">Due soon</span> if anything is due within 30
            days, in progress, or activation is blocked; else <span className="text-emerald-800">Clear</span>.
          </li>
          <li>
            Cells: <span className="font-mono text-[11px]">✓</span> ok, <span className="font-mono">!</span> due soon,{" "}
            <span className="font-mono">−</span> missing, <span className="font-mono">×</span> expired/overdue,{" "}
            <span className="font-mono">·</span> not applicable. Hover for detail. Readiness, flags, and cells link into
            the matching section on the employee record.
          </li>
          <li>
            Insurance combines auto and independent contractor coverage when applicable. TB column is the credential; TB
            yr is the annual TB statement event.
          </li>
          <li>
            <span className="font-medium">Credential SMS:</span> one text per click listing all pending items; sends
            are logged in <code className="rounded bg-slate-100 px-1">employee_credential_reminder_sends</code> and the
            SMS thread. The same employee + credential + expiration snapshot + stage (due soon / expired / missing)
            won&apos;t be texted twice until that snapshot changes.
          </li>
          <li>
            <span className="font-medium">Reminder history:</span> <span className="font-medium">Last SMS</span> is the
            most recent logged send for that employee. Badges (<span className="font-medium">30d sent</span>,{" "}
            <span className="font-medium">7d sent</span>, <span className="font-medium">Exp sent</span>,{" "}
            <span className="font-medium">Miss sent</span>) mean at least one row exists for that stage in the audit
            table—open the employee for the full log (credential, stage, time, phone).
          </li>
        </ul>
        <p className="mt-3 text-slate-500">
          Showing up to 120 rows. Call uses in-app Twilio (keypad or phone calls page). Text opens or creates SMS.
        </p>
      </div>
    </div>
  );
}
