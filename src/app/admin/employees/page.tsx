import Link from "next/link";
import { redirect } from "next/navigation";

import { EmployeeDirectoryDialButton } from "./employee-directory-dial-button";
import {
  type EmployeeDirectorySegment,
  filterEmployeeDirectoryRows,
  loadEmployeeDirectoryRows,
  loadSmsConversationIdsByE164,
} from "@/lib/admin/employee-directory-data";
import { formatPhoneForDisplay, phoneToTelHref } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

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

function buildQuery(sp: { segment: EmployeeDirectorySegment; q: string }): string {
  const u = new URLSearchParams();
  if (sp.segment !== "all") u.set("segment", sp.segment);
  if (sp.q.trim()) u.set("q", sp.q.trim());
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

  const { rows: allRows, loadError } = await loadEmployeeDirectoryRows();
  const filtered = filterEmployeeDirectoryRows(allRows, segment, q);
  const e164s = filtered.map((r) => r.e164).filter((x): x is string => Boolean(x));
  const smsByE164 = await loadSmsConversationIdsByE164(e164s);

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
            Everyone in the hiring and employment pipeline comes from{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">applicants</code> plus related onboarding and
            compliance data—the same source as the admin dashboard and individual employee records. Records appear
            here automatically when people apply or are added to onboarding; there is no separate “create employee”
            action.
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
              href={`/admin/employees${buildQuery({ segment: s.value, q })}`}
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
        <table className="w-full min-w-[1020px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Stage</th>
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
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No rows match the current filters. Adjust segment or search, or confirm applicants exist in Supabase.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const id = r.applicant.id;
                const tel = phoneToTelHref(r.applicant.phone as string | null);
                const smsId = r.e164 ? smsByE164.get(r.e164) : undefined;
                return (
                  <tr key={id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.statusBadgeClass}`}
                      >
                        {r.statusBadgeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${stagePillClass(r.stageTone)}`}
                      >
                        {r.stageLabel}
                      </span>
                    </td>
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
                        {r.e164 ? (
                          <>
                            <EmployeeDirectoryDialButton e164={r.e164} />
                            {tel ? (
                              <a
                                href={tel}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
                              >
                                Tel
                              </a>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">No phone</span>
                        )}
                        {r.e164 && smsId ? (
                          <Link
                            href={`/admin/phone/messages/${smsId}`}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                          >
                            Text
                          </Link>
                        ) : r.e164 ? (
                          <span className="text-[11px] text-slate-400" title="No SMS thread for this number yet">
                            Text —
                          </span>
                        ) : null}
                        <Link
                          href={`/admin/employees/${id}#event-management`}
                          className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100"
                        >
                          Events
                        </Link>
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
        Showing up to 120 rows after filters. “Ready to activate” matches the admin dashboard pipeline rule
        (onboarding, no missing/overdue credentials blocking, no annual overdue). “Missing compliance / survey gaps”
        includes survey readiness, credential gaps, annual gaps, and activation-blocked onboarding profiles.
      </p>
    </div>
  );
}
