import Link from "next/link";
import { redirect } from "next/navigation";

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
  return v === "name" || v === "status" || v === "updated";
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

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-indigo-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/crm/contacts" className="underline-offset-2 hover:underline">
          Contacts
        </Link>
        <Link href="/admin/crm/leads" className="underline-offset-2 hover:underline">
          Leads
        </Link>
        <Link href="/admin/crm/patients" className="underline-offset-2 hover:underline">
          Patients
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Employees</span>
      </nav>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance command center</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            CHAP-style readiness across credentials and annual programs. Employment reconciles{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">applicants.status</code> with stage{" "}
            <span className="font-medium">Active Employee</span> when forms are finalized. Item cells use the same
            rules as the admin dashboard:{" "}
            <span className="font-medium text-emerald-800">OK</span>,{" "}
            <span className="font-medium text-amber-800">due soon</span>,{" "}
            <span className="font-medium text-slate-700">missing</span>,{" "}
            <span className="font-medium text-red-800">expired/overdue</span>,{" "}
            <span className="text-slate-400">n/a</span> (not required or pre-hire). Rows come from applicants and
            onboarding data only.
          </p>
          {loadError ? (
            <p className="mt-2 text-sm text-red-700">Could not load applicants: {loadError}</p>
          ) : null}
        </div>
        <Link
          href="/admin"
          className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50"
        >
          Back to dashboard
        </Link>
      </div>

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
          <select name="sort" defaultValue={sort} className={`${filterInputCls} min-w-[9rem]`}>
            <option value="updated">Last updated</option>
            <option value="name">Name</option>
            <option value="status">Employment status</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Order
          <select name="dir" defaultValue={dir} className={filterInputCls}>
            <option value="desc">Newest / Z→A</option>
            <option value="asc">Oldest / A→Z</option>
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

      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                Name
              </th>
              <th className="px-2 py-3">Employment</th>
              <th className="px-2 py-3">Stage</th>
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
              <th className="whitespace-nowrap px-2 py-3">Actions</th>
            </tr>
            <tr className="border-b border-slate-100 bg-slate-50/90 text-[10px] text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50/90 px-3 py-1" />
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={20} className="px-4 py-10 text-center text-sm text-slate-500">
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

                const itemCell = (key: string) => {
                  const it = byKey[key];
                  if (!it) {
                    return (
                      <td className="px-0.5 py-1.5 text-center">
                        <span className="inline-block min-w-[1.75rem] rounded border border-slate-100 bg-slate-50 px-1 py-0.5 text-[9px] text-slate-300">
                          —
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td className="px-0.5 py-1.5 text-center" title={it.hint}>
                      <span
                        className={`inline-flex min-w-[1.75rem] justify-center rounded px-1 py-0.5 text-[9px] font-bold ${complianceItemPillClass(it.tier)}`}
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
                      </span>
                    </td>
                  );
                };

                return (
                  <tr
                    key={id}
                    className="border-b border-slate-100 last:border-0 odd:bg-white even:bg-slate-50/40"
                  >
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-semibold text-slate-900 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                      {r.nameDisplay}
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
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.commandComplianceBadgeClass}`}
                      >
                        {r.commandComplianceLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex max-w-[9.5rem] flex-wrap gap-1">
                        {r.flagMissingCredential ? (
                          <span
                            className={`${flagBadge} border-red-200 bg-red-50 text-red-800`}
                            title="Required credential missing on file"
                          >
                            Miss cred
                          </span>
                        ) : null}
                        {r.flagExpiringSoon ? (
                          <span
                            className={`${flagBadge} border-amber-200 bg-amber-50 text-amber-900`}
                            title="Credential or annual due within 30 days"
                          >
                            Due 30d
                          </span>
                        ) : null}
                        {r.flagAnnualDue ? (
                          <span
                            className={`${flagBadge} border-violet-200 bg-violet-50 text-violet-900`}
                            title="Annual program missing, due, or overdue"
                          >
                            Annual
                          </span>
                        ) : null}
                        {r.flagOnboardingIncomplete ? (
                          <span
                            className={`${flagBadge} border-sky-200 bg-sky-50 text-sky-900`}
                            title="Onboarding file incomplete (app, docs, contracts, training, or tax)"
                          >
                            Onboard
                          </span>
                        ) : null}
                        {r.flagActivationBlocked ? (
                          <span
                            className={`${flagBadge} border-rose-200 bg-rose-50 text-rose-900`}
                            title="Cannot activate: onboarding/applicant with blocking gaps"
                          >
                            Blocked
                          </span>
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
            <span className="font-medium">Readiness</span> rolls up tracked items:{" "}
            <span className="text-red-800">Missing / expired</span> if any required item is missing, expired, or a
            credential is overdue; else <span className="text-amber-800">Due soon</span> if anything is due within 30
            days, in progress, or activation is blocked; else <span className="text-emerald-800">Clear</span>.
          </li>
          <li>
            Cells: <span className="font-mono text-[11px]">✓</span> ok, <span className="font-mono">!</span> due soon,{" "}
            <span className="font-mono">−</span> missing, <span className="font-mono">×</span> expired/overdue,{" "}
            <span className="font-mono">·</span> not applicable. Hover for detail.
          </li>
          <li>
            Insurance combines auto and independent contractor coverage when applicable. TB column is the credential; TB
            yr is the annual TB statement event.
          </li>
        </ul>
        <p className="mt-3 text-slate-500">
          Showing up to 120 rows. Call uses in-app Twilio (keypad or phone calls page). Text opens or creates SMS.
        </p>
      </div>
    </div>
  );
}
