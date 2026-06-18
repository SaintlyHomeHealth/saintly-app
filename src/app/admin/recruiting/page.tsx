import Link from "next/link";
import { redirect } from "next/navigation";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import {
  applyAdminRecruitingLeadsClientFilters,
  attachAdminRecruitingLeadsListPredicates,
  buildAdminRecruitingLeadDetailHref,
  matchesAdminRecruitingLeadsTabFilter,
  parseAdminRecruitingLeadsListSearchParams,
  recruitingLeadSourceBadgeForRow,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import { isPhoenixSameCalendarDay } from "@/lib/recruiting/phoenix-time";
import { isRecruitingEmailConfigured } from "@/lib/recruiting/recruiting-email-from";
import { syncOrphanRecruitingCandidatesToLeads } from "@/lib/recruiting/sync-orphan-recruiting-candidates";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { RecruitingLeadFilters } from "../recruiting-leads/_components/RecruitingLeadFilters";
import { RecruitingLeadListCard } from "../recruiting-leads/_components/RecruitingLeadListCard";
import { RecruitingWorkspaceStatsCards } from "./_components/RecruitingWorkspaceStatsCards";
import { RecruitingWorkspaceTabs } from "./_components/RecruitingWorkspaceTabs";

const LIST_SELECT =
  "id, full_name, phone, email, license_status, lead_type, home_health_experience, visits_per_week, coverage_area, start_date, source, form_name, raw_payload, status, notes, created_at";

const STATS_SELECT = "status, source, form_name, raw_payload, created_at";

type LeadListRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_status: string | null;
  lead_type: string | null;
  home_health_experience: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  source: string | null;
  form_name: string | null;
  raw_payload: unknown;
  status: string;
  notes: string | null;
  created_at: string;
};

type StatsRow = {
  status: string;
  source: string | null;
  form_name: string | null;
  raw_payload: unknown;
  created_at: string;
};

function computeStats(rows: StatsRow[]) {
  let newLeads = 0;
  let newToday = 0;
  let formFacebookLeads = 0;
  let resumeUploads = 0;
  for (const row of rows) {
    if (row.status === "New") newLeads += 1;
    if (isPhoenixSameCalendarDay(row.created_at)) newToday += 1;
    const badge = recruitingLeadSourceBadgeForRow(row);
    if (badge === "Facebook" || badge === "Website Careers") formFacebookLeads += 1;
    if (badge === "Manual Resume Upload") resumeUploads += 1;
  }
  return {
    total: rows.length,
    newLeads,
    newToday,
    formFacebookLeads,
    resumeUploads,
  };
}

function computeTabCounts(rows: LeadListRow[]) {
  return {
    all: rows.length,
    form_facebook: rows.filter((row) => matchesAdminRecruitingLeadsTabFilter(row, "form_facebook")).length,
    resume_uploads: rows.filter((row) => matchesAdminRecruitingLeadsTabFilter(row, "resume_uploads")).length,
    new_today: rows.filter((row) => matchesAdminRecruitingLeadsTabFilter(row, "new_today")).length,
  } as const;
}

export default async function AdminRecruitingWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  await syncOrphanRecruitingCandidatesToLeads(supabaseAdmin, 40);

  const rawSp = await searchParams;
  const f = parseAdminRecruitingLeadsListSearchParams(rawSp);

  let query = supabaseAdmin
    .from("facebook_recruiting_leads")
    .select(LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(2000);
  query = attachAdminRecruitingLeadsListPredicates(query, f) as typeof query;

  const { data: rows, error } = await query;
  const dbList = (rows ?? []) as LeadListRow[];
  if (error) {
    console.warn("[recruiting] list:", error.message);
  }

  const list = applyAdminRecruitingLeadsClientFilters(dbList, f);

  const { data: statsRows, count: statsCount } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select(STATS_SELECT, { count: "exact" })
    .limit(5000);

  const stats = computeStats((statsRows ?? []) as StatsRow[]);
  if (statsCount != null && statsCount > stats.total) {
    stats.total = statsCount;
  }

  const tabCounts = computeTabCounts((statsRows ?? []) as LeadListRow[]);

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

  const emailConfigured = isRecruitingEmailConfigured();

  const updatedBanner =
    typeof rawSp.updated === "string" && rawSp.updated === "1"
      ? "Existing lead updated with the new resume."
      : null;

  return (
    <div className="min-h-full space-y-6 bg-gradient-to-b from-sky-50/70 via-white to-white p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Hiring"
        title="Recruiting"
        description="One workspace for Facebook, website careers, resume uploads, and legacy recruiting leads."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/admin/recruiting/bulk-upload"
              className="inline-flex items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100"
            >
              Bulk resumes
            </Link>
            <Link href="/admin/recruiting/new-from-resume" className={crmPrimaryCtaCls}>
              Upload resume
            </Link>
          </div>
        }
      />

      {updatedBanner ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          {updatedBanner}
        </div>
      ) : null}

      <RecruitingWorkspaceStatsCards
        total={stats.total}
        newLeads={stats.newLeads}
        newToday={stats.newToday}
        formFacebookLeads={stats.formFacebookLeads}
        resumeUploads={stats.resumeUploads}
      />

      <RecruitingWorkspaceTabs filters={f} counts={tabCounts} />

      <RecruitingLeadFilters filters={f} coverageOptions={coverageOptions} />

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-16 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-800">No leads match these filters</p>
          <p className="mt-2 text-sm text-slate-600">
            Try a different tab or upload a resume to add a new applicant.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link href="/admin/recruiting/new-from-resume" className={crmPrimaryCtaCls}>
              Upload resume
            </Link>
            <Link
              href="/admin/recruiting"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View all leads
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-500">
            {list.length} lead{list.length === 1 ? "" : "s"}
            {list.length !== dbList.length ? ` (filtered from ${dbList.length})` : ""}
          </p>
          {list.map((row) => (
            <RecruitingLeadListCard
              key={row.id}
              row={row}
              detailHref={buildAdminRecruitingLeadDetailHref(row.id, f)}
              emailConfigured={emailConfigured}
            />
          ))}
        </div>
      )}
    </div>
  );
}
