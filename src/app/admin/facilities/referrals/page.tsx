import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AnalyticsNavLink } from "@/app/admin/facilities/_components/AnalyticsNavLink";
import { FacilityReferralsView } from "@/app/admin/facilities/_components/FacilityReferralsView";
import { FacilityNotificationBell } from "@/app/admin/facilities/_components/FacilityNotificationBell";
import { FollowUpNavLink } from "@/app/admin/facilities/_components/FollowUpNavLink";
import { OutreachNavLink } from "@/app/admin/facilities/_components/OutreachNavLink";
import { RouteBuilderNavLink } from "@/app/admin/facilities/_components/RouteBuilderNavLink";
import { SourceReviewNavLink } from "@/app/admin/facilities/_components/SourceReviewNavLink";
import { AdmissionsNavLink } from "@/app/admin/intake/_components/AdmissionsNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityReferralsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const canFilterReps = canAccessFacilityAdminTools(staff);
  const canEditIntake = canAccessFacilityAdminTools(staff);

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .order("full_name");

  const staffOptions = (staffRows ?? []).map((s) => {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    return { user_id: row.user_id, label: staffPrimaryLabel(row) };
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales & intake"
        title="Facility Referral Pipeline"
        description="Track facility-sourced referrals from outreach to admission."
        actions={
          <div className="flex flex-wrap gap-2">
            <OutreachNavLink />
            <FollowUpNavLink />
            <AnalyticsNavLink />
            <SourceReviewNavLink label="Open Source Review Workbench" />
            <AdmissionsNavLink />
            <RouteBuilderNavLink />
            <Link href="/admin/facilities" className={crmPrimaryCtaCls.replace("from-sky-600", "from-slate-600").replace("to-cyan-500", "to-slate-500")}>
              All facilities
            </Link>
            <FacilityNotificationBell />
          </div>
        }
      />

      <Suspense fallback={<p className="text-sm text-slate-600">Loading referrals…</p>}>
        <FacilityReferralsView
          staffOptions={staffOptions}
          canFilterReps={canFilterReps}
          canEditIntake={canEditIntake}
          currentUserId={staff.user_id}
        />
      </Suspense>
    </div>
  );
}
