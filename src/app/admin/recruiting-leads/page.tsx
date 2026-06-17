import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import {
  applyAdminRecruitingLeadsClientFilters,
  attachAdminRecruitingLeadsListPredicates,
  buildAdminRecruitingLeadDetailHref,
  parseAdminRecruitingLeadsListSearchParams,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import { recruitingLeadSourceBadge } from "@/lib/recruiting/recruiting-lead-source-display";
import { isRecruitingEmailConfigured } from "@/lib/recruiting/recruiting-email-from";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { RecruitingLeadFilters } from "./_components/RecruitingLeadFilters";
import { RecruitingLeadListCard } from "./_components/RecruitingLeadListCard";
import { RecruitingLeadStatsCards } from "./_components/RecruitingLeadStatsCards";

const LIST_SELECT =
  "id, full_name, phone, email, license_status, lead_type, home_health_experience, visits_per_week, coverage_area, start_date, source, form_name, raw_payload, status, notes, created_at";

const STATS_SELECT = "status, source, form_name, raw_payload";

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
};

function computeStats(rows: StatsRow[]) {
  let newLeads = 0;
  let facebookLeads = 0;
  for (const row of rows) {
    if (row.status === "New") newLeads += 1;
    const badge = recruitingLeadSourceBadge({
      source: row.source,
      form_name: row.form_name,
      raw_payload: row.raw_payload,
    });
    if (badge === "Facebook") facebookLeads += 1;
  }
  const total = rows.length;
  return {
    total,
    newLeads,
    facebookLeads,
    otherLeads: total - facebookLeads,
  };
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
  const dbList = (rows ?? []) as LeadListRow[];
  if (error) {
    console.warn("[recruiting-leads] list:", error.message);
  }

  const list = applyAdminRecruitingLeadsClientFilters(dbList, f);

  const { data: statsRows, count: statsCount } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select(STATS_SELECT, { count: "exact" })
    .limit(5000);

  const stats = computeStats((statsRows ?? []) as StatsRow[]);
  if (statsCount != null && statsCount > stats.total) {
    stats.total = statsCount;
    stats.otherLeads = stats.total - stats.facebookLeads;
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

  const emailConfigured = isRecruitingEmailConfigured();

  return (
    <div className="min-h-full space-y-6 bg-gradient-to-b from-sky-50/70 via-white to-white p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Hiring"
        title="Recruiting Leads"
        description="Hiring applicants from Facebook, website careers, resume uploads, and legacy CRM recruiting leads."
      />

      <RecruitingLeadStatsCards
        total={stats.total}
        newLeads={stats.newLeads}
        facebookLeads={stats.facebookLeads}
        otherLeads={stats.otherLeads}
      />

      <RecruitingLeadFilters filters={f} coverageOptions={coverageOptions} />

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-16 text-center text-sm text-slate-600 shadow-sm">
          No recruiting leads match these filters yet.
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
