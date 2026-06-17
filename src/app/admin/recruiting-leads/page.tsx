import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  crmFilterBarCls,
  crmFilterInputCls,
  crmListRowHoverCls,
  crmListScrollOuterCls,
} from "@/components/admin/crm-admin-list-styles";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { supabaseAdmin } from "@/lib/admin";
import {
  attachAdminRecruitingLeadsListPredicates,
  parseAdminRecruitingLeadsListSearchParams,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import { FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS } from "@/lib/recruiting/facebook-recruiting-lead-options";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { facebookRecruitingLeadStatusPillClass } from "./recruiting-leads-status-styles";

const LIST_SELECT =
  "id, full_name, phone, email, license_status, home_health_experience, visits_per_week, coverage_area, start_date, source, status, created_at";

type LeadListRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_status: string | null;
  home_health_experience: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  source: string | null;
  status: string;
  created_at: string;
};

const rowActionBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:shadow-md whitespace-nowrap";

function formatListDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildFilterQs(sp: {
  q?: string;
  status?: string;
  coverage?: string;
  license?: string;
}): string {
  const u = new URLSearchParams();
  if (sp.q) u.set("q", sp.q);
  if (sp.status) u.set("status", sp.status);
  if (sp.coverage) u.set("coverage", sp.coverage);
  if (sp.license) u.set("license", sp.license);
  const s = u.toString();
  return s ? `?${s}` : "";
}

export default async function AdminRecruitingLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const rawSp = await searchParams;
  const f = parseAdminRecruitingLeadsListSearchParams(rawSp);

  let query = supabaseAdmin
    .from("facebook_recruiting_leads")
    .select(LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(2000);
  query = attachAdminRecruitingLeadsListPredicates(query, f) as typeof query;

  const { data: rows, error } = await query;
  const list = (rows ?? []) as LeadListRow[];
  if (error) {
    console.warn("[recruiting-leads] list:", error.message);
  }

  const { data: coverageRows } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select("coverage_area")
    .not("coverage_area", "is", null)
    .limit(2000);
  const coverageOptions = [
    ...new Set(
      (coverageRows ?? [])
        .map((r) => (r as { coverage_area: string | null }).coverage_area)
        .filter((c): c is string => Boolean(c && c.trim()))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const { data: licenseRows } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select("license_status")
    .not("license_status", "is", null)
    .limit(2000);
  const licenseOptions = [
    ...new Set(
      (licenseRows ?? [])
        .map((r) => (r as { license_status: string | null }).license_status)
        .filter((c): c is string => Boolean(c && c.trim()))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filterQs = buildFilterQs(f);

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Hiring"
        title="Recruiting Leads"
        description="Hiring applicants from Facebook Lead Ads and the Saintly website careers form. Patient referral leads stay in CRM Leads."
      />

      <form method="get" action="/admin/recruiting-leads" className={`${crmFilterBarCls} flex-wrap`}>
        <label className="flex min-w-[12rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search
          <input
            name="q"
            defaultValue={f.q}
            placeholder="Name, phone, or email…"
            className={`${crmFilterInputCls} min-w-[12rem]`}
            autoComplete="off"
          />
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={`${crmFilterInputCls} min-w-[9rem]`}>
            <option value="">All</option>
            {FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Coverage area
          <input
            name="coverage"
            list="recruiting-leads-coverage-options"
            defaultValue={f.coverageArea}
            placeholder="Area or region…"
            className={`${crmFilterInputCls} min-w-[11rem]`}
          />
          <datalist id="recruiting-leads-coverage-options">
            {coverageOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          License status
          <input
            name="license"
            list="recruiting-leads-license-options"
            defaultValue={f.licenseStatus}
            placeholder="Yes / No / …"
            className={`${crmFilterInputCls} min-w-[10rem]`}
          />
          <datalist id="recruiting-leads-license-options">
            {licenseOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
        >
          Apply
        </button>
        <Link
          href="/admin/recruiting-leads"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      {list.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-16 text-center text-sm text-slate-600 shadow-sm">
          No recruiting leads match these filters yet.
        </div>
      ) : (
        <div className={crmListScrollOuterCls}>
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 align-middle">Date</th>
                <th className="px-4 py-3 align-middle">Name</th>
                <th className="px-4 py-3 align-middle">Phone</th>
                <th className="px-4 py-3 align-middle">Email</th>
                <th className="px-4 py-3 align-middle">License Status</th>
                <th className="px-4 py-3 align-middle">Home Health Exp.</th>
                <th className="px-4 py-3 align-middle">Visits/Week</th>
                <th className="px-4 py-3 align-middle">Coverage Area</th>
                <th className="px-4 py-3 align-middle">Start Date</th>
                <th className="px-4 py-3 align-middle">Source</th>
                <th className="px-4 py-3 align-middle">Status</th>
                <th className="px-4 py-3 align-middle text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((row) => (
                <tr key={row.id} className={`bg-white/90 ${crmListRowHoverCls}`}>
                  <td className="px-4 py-3 align-middle text-xs text-slate-600">{formatListDate(row.created_at)}</td>
                  <td className="px-4 py-3 align-middle">
                    <Link
                      href={`/admin/recruiting-leads/${row.id}${filterQs}`}
                      className="font-semibold text-slate-900 hover:text-sky-800 hover:underline"
                    >
                      {row.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">
                    {row.phone ? formatPhoneForDisplay(row.phone) : "—"}
                  </td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-600">{row.email?.trim() || "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">{row.license_status ?? "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">{row.home_health_experience ?? "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">{row.visits_per_week ?? "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">{row.coverage_area ?? "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">{row.start_date ?? "—"}</td>
                  <td className="px-4 py-3 align-middle text-xs text-slate-700">{row.source ?? "—"}</td>
                  <td className="px-4 py-3 align-middle">
                    <span className={facebookRecruitingLeadStatusPillClass(row.status)}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <Link href={`/admin/recruiting-leads/${row.id}${filterQs}`} className={rowActionBtnCls}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
