import Link from "next/link";
import { redirect } from "next/navigation";

import {
  type EmployeeDirectorySegment,
  type EmployeeDirectorySortDir,
  type EmployeeDirectorySortKey,
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
  { value: "inactive", label: "Inactive" },
  { value: "in_process", label: "In process" },
  { value: "applicant_onboarding", label: "Applicant / onboarding" },
  { value: "ready_to_activate", label: "Ready to activate" },
  { value: "compliance_gaps", label: "Missing compliance / survey gaps" },
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

/** Twilio softphone deep link: workspace keypad when allowed, else admin call log with the same dial query contract. */
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

function compliancePillClass(tone: "green" | "amber" | "red"): string {
  switch (tone) {
    case "green":
      return "border border-emerald-200 bg-emerald-50 text-emerald-900";
    case "amber":
      return "border border-amber-200 bg-amber-50 text-amber-900";
    case "red":
      return "border border-red-200 bg-red-50 text-red-900";
    default:
      return "border border-slate-200 bg-slate-50 text-slate-700";
  }
}

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
          <h1 className="text-2xl font-bold text-slate-900">Employee directory</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            <span className="font-medium text-slate-800">Employment</span> reconciles{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">applicants.status</code> with the onboarding{" "}
            <span className="font-medium text-slate-800">Stage</span> pill: anyone with stage{" "}
            <span className="font-medium">Active Employee</span> (finalized admin forms) is shown as{" "}
            <span className="font-medium">Active</span> even if the applicant row still says applicant;{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">inactive</code> always wins.{" "}
            <span className="font-medium text-slate-800">Stage</span> stays the pipeline position (new hire, in
            progress, etc.). No manual employee creation.
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
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Employment</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Compliance</th>
              <th className="px-4 py-3">Last updated</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role / discipline</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="whitespace-nowrap px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
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
                return (
                  <tr key={id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.employmentStatusBadgeClass}`}
                      >
                        {r.employmentStatusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stagePillClass(r.stageTone)}`}
                      >
                        {r.stageLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${compliancePillClass(r.complianceTone)}`}
                      >
                        {r.complianceLabel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{updatedLabel}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.nameDisplay}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">{r.roleDisplay}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-600">
                      {r.applicant.email || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatPhoneForDisplay(r.applicant.phone as string | null)}
                    </td>
                    <td className="px-4 py-3">
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

      <p className="text-xs text-slate-500">
        Showing up to 120 rows after filters. “Ready to activate” matches the admin dashboard pipeline rule. “Text”
        opens or creates an SMS thread. “Call” opens the in-app Twilio keypad (
        <code className="rounded bg-slate-100 px-1">/workspace/phone/keypad?dial=…&amp;place=1</code>
        ) when you have workspace phone access; otherwise the same number is prefilled on{" "}
        <code className="rounded bg-slate-100 px-1">/admin/phone/calls</code> (no <code className="rounded bg-slate-100 px-1">tel:</code>
        ).
      </p>
    </div>
  );
}
