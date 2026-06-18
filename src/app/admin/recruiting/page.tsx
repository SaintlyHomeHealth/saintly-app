import Link from "next/link";
import { redirect } from "next/navigation";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import {
  ADMIN_RECRUITING_LEADS_PAGE_SIZE,
  attachAdminRecruitingLeadsListPredicates,
  parseAdminRecruitingLeadsListSearchParams,
  recruitingLeadsListRange,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import {
  buildAdminRecruitingWorkingDetailHref,
  mapRecruitingLeadIdsToCandidateIds,
} from "@/lib/recruiting/recruiting-working-detail-href";
import {
  fetchRecruitingCandidatesForLeadListDisplay,
  logRecruitingLeadListCardDisplayDebug,
  mergeRecruitingLeadListRowWithCandidate,
} from "@/lib/recruiting/recruiting-lead-list-display";
import {
  countFilteredRecruitingLeads,
  fetchRecruitingLeadTabCounts,
  fetchRecruitingLeadWorkspaceStats,
} from "@/lib/recruiting/admin-recruiting-leads-stats";
import { isRecruitingEmailConfigured } from "@/lib/recruiting/recruiting-email-from";
import { adminPerfTimed, routePerfLog, routePerfStart } from "@/lib/perf/route-perf";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { RecruitingLeadFilters } from "@/app/admin/recruiting/_components/RecruitingLeadFilters";
import { RecruitingLeadListCard } from "@/app/admin/recruiting/_components/RecruitingLeadListCard";
import { RecruitingLeadPagination } from "@/app/admin/recruiting/_components/RecruitingLeadPagination";
import { SyncLegacyRecruitingCandidatesButton } from "@/app/admin/recruiting/_components/SyncLegacyRecruitingCandidatesButton";
import { RecruitingWorkspaceStatsCards } from "./_components/RecruitingWorkspaceStatsCards";
import { RecruitingWorkspaceTabs } from "./_components/RecruitingWorkspaceTabs";

/** Card list fields only — no raw_payload, notes, or resume blobs. */
const LIST_SELECT =
  "id, full_name, phone, email, license_status, lead_type, visits_per_week, coverage_area, start_date, source, form_name, status, created_at";

type LeadListRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_status: string | null;
  lead_type: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  source: string | null;
  form_name: string | null;
  status: string;
  created_at: string;
};

export default async function AdminRecruitingWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfStart = routePerfStart();
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const rawSp = await searchParams;
  const f = parseAdminRecruitingLeadsListSearchParams(rawSp);
  const { from, to } = recruitingLeadsListRange(f);

  const [stats, tabCounts, filteredTotal, listRows] = await Promise.all([
    adminPerfTimed("admin/recruiting.stats", () => fetchRecruitingLeadWorkspaceStats(supabaseAdmin)),
    adminPerfTimed("admin/recruiting.tabCounts", () => fetchRecruitingLeadTabCounts(supabaseAdmin)),
    adminPerfTimed("admin/recruiting.filteredCount", () => countFilteredRecruitingLeads(supabaseAdmin, f)),
    adminPerfTimed("admin/recruiting.list", async () => {
      let query = supabaseAdmin
        .from("facebook_recruiting_leads")
        .select(LIST_SELECT)
        .order("created_at", { ascending: false })
        .range(from, to);
      query = attachAdminRecruitingLeadsListPredicates(query, f) as typeof query;
      const { data, error } = await query;
      if (error) {
        console.warn("[recruiting] list:", error.message);
        return [] as LeadListRow[];
      }
      return (data ?? []) as LeadListRow[];
    }),
  ]);

  routePerfLog("admin/recruiting", perfStart);

  const candidateByLeadId = await adminPerfTimed("admin/recruiting.candidateLinks", () =>
    mapRecruitingLeadIdsToCandidateIds(
      supabaseAdmin,
      listRows.map((row) => row.id)
    )
  );

  const candidateById = await adminPerfTimed("admin/recruiting.candidateRows", () =>
    fetchRecruitingCandidatesForLeadListDisplay(
      supabaseAdmin,
      [...new Set([...candidateByLeadId.values()])]
    )
  );

  const displayRows = listRows.map((row) => {
    const candidateId = candidateByLeadId.get(row.id);
    const candidate = candidateId ? candidateById.get(candidateId) : undefined;
    const displayRow = mergeRecruitingLeadListRowWithCandidate(row, candidate);
    logRecruitingLeadListCardDisplayDebug({
      leadId: row.id,
      leadFullName: row.full_name,
      candidateId,
      candidateFullName: candidate?.full_name,
      displayFullName: displayRow.full_name,
    });
    return displayRow;
  });

  const emailConfigured = isRecruitingEmailConfigured();
  const totalPages = Math.max(1, Math.ceil(filteredTotal / ADMIN_RECRUITING_LEADS_PAGE_SIZE));

  const updatedBanner =
    typeof rawSp.updated === "string" && rawSp.updated === "1"
      ? "Existing lead updated with the new resume."
      : null;

  const syncBanner =
    typeof rawSp.synced === "string" && rawSp.synced === "1"
      ? "Legacy resume uploads synced into the recruiting leads list."
      : null;

  return (
    <div className="min-h-full space-y-6 bg-gradient-to-b from-sky-50/70 via-white to-white p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Hiring"
        title="Recruiting"
        description="One workspace for Facebook, website careers, resume uploads, and legacy recruiting leads."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SyncLegacyRecruitingCandidatesButton />
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

      {syncBanner ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          {syncBanner}
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

      <RecruitingLeadFilters filters={f} />

      {listRows.length === 0 ? (
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500">
              Showing {from + 1}–{from + listRows.length} of {filteredTotal} lead
              {filteredTotal === 1 ? "" : "s"}
            </p>
            <RecruitingLeadPagination filters={f} page={f.page} totalPages={totalPages} />
          </div>
          {displayRows.map((row) => (
            <RecruitingLeadListCard
              key={row.id}
              row={row}
              detailHref={buildAdminRecruitingWorkingDetailHref(row.id, candidateByLeadId.get(row.id), f)}
              emailConfigured={emailConfigured}
            />
          ))}
          <RecruitingLeadPagination filters={f} page={f.page} totalPages={totalPages} />
        </div>
      )}
    </div>
  );
}
