import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { RecruitingLeadResumeDocumentClientRow } from "@/components/recruiting/RecruitingLeadResumeDocumentsPanel";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import {
  buildAdminRecruitingLeadsListHref,
  parseAdminRecruitingLeadsListSearchParams,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import { listRecruitingLeadResumeDocuments } from "@/lib/recruiting/recruiting-lead-candidate-bridge";
import { isRecruitingEmailConfigured } from "@/lib/recruiting/recruiting-email-from";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import type { RecruitingLeadActivityRow } from "@/app/admin/recruiting/_components/RecruitingLeadActivityTimeline";
import { FacebookRecruitingLeadDetailClient } from "@/app/admin/recruiting/_components/FacebookRecruitingLeadDetailClient";
import { RecruitingLeadDetailDeleteButton } from "@/app/admin/recruiting/_components/RecruitingLeadDeleteButton";

function buildListBackHref(sp: Record<string, string | string[] | undefined>): string {
  return buildAdminRecruitingLeadsListHref(parseAdminRecruitingLeadsListSearchParams(sp));
}

export default async function AdminRecruitingLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { leadId } = await params;
  if (!leadId?.trim()) {
    notFound();
  }

  const sp = await searchParams;

  const updatedBanner =
    typeof sp.updated === "string" && sp.updated === "1"
      ? "Existing lead updated with the new resume."
      : null;

  const { data: lead, error } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select("*")
    .eq("id", leadId.trim())
    .maybeSingle();

  if (error || !lead?.id) {
    notFound();
  }

  const { data: activityRows, error: activityErr } = await supabaseAdmin
    .from("facebook_recruiting_lead_activities")
    .select("id, event_type, body, metadata, created_at, created_by")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (activityErr) {
    console.warn("[recruiting/lead/detail] activities:", activityErr.message);
  }

  const creatorIds = [
    ...new Set(
      (activityRows ?? [])
        .map((r) => (typeof (r as { created_by?: unknown }).created_by === "string" ? String(r.created_by) : ""))
        .filter(Boolean)
    ),
  ];

  const staffByUserId = new Map<string, { full_name: string | null; email: string | null }>();
  if (creatorIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, email")
      .in("user_id", creatorIds);
    for (const row of staffRows ?? []) {
      const uid = typeof row.user_id === "string" ? row.user_id : "";
      if (uid) {
        staffByUserId.set(uid, {
          full_name: typeof row.full_name === "string" ? row.full_name : null,
          email: typeof row.email === "string" ? row.email : null,
        });
      }
    }
  }

  const activities: RecruitingLeadActivityRow[] = (activityRows ?? []).map((row) => {
    const r = row as {
      id: string;
      event_type: string;
      body: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      created_by: string | null;
    };
    const creator = r.created_by ? staffByUserId.get(r.created_by) : null;
    return {
      id: r.id,
      event_type: r.event_type,
      body: r.body,
      metadata: r.metadata,
      created_at: r.created_at,
      created_by_name: creator ? staffPrimaryLabel(creator) : null,
    };
  });

  const resumeDocuments: RecruitingLeadResumeDocumentClientRow[] = (
    await listRecruitingLeadResumeDocuments(supabaseAdmin, lead.id)
  ).map((doc) => ({
    id: doc.id,
    file_name: doc.file_name,
    uploaded_at: doc.uploaded_at,
    source: doc.source,
    recruiting_candidate_id: doc.recruiting_candidate_id,
  }));

  return (
    <div className="min-h-full space-y-6 bg-gradient-to-b from-sky-50/70 via-white to-white p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Hiring"
        title="Recruiting Lead"
        description="Review applicant answers, send follow-up emails, and update recruiting status."
      />
      {updatedBanner ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          {updatedBanner}
        </div>
      ) : null}
      <FacebookRecruitingLeadDetailClient
        lead={lead}
        listBackHref={buildListBackHref(sp)}
        activities={activities}
        emailConfigured={isRecruitingEmailConfigured()}
        resumeDocuments={resumeDocuments}
        deleteAction={
          <RecruitingLeadDetailDeleteButton
            leadId={lead.id}
            leadName={String(lead.full_name ?? "Recruiting lead")}
            listBackHref={buildListBackHref(sp)}
          />
        }
      />
    </div>
  );
}
