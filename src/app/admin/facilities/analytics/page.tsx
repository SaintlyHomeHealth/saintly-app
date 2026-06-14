import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalyticsNavLink } from "@/app/admin/facilities/_components/AnalyticsNavLink";
import { FacilityAnalyticsView } from "@/app/admin/facilities/_components/FacilityAnalyticsView";
import { FacilityNotificationBell } from "@/app/admin/facilities/_components/FacilityNotificationBell";
import { PlaybooksNavLink } from "@/app/admin/facilities/_components/PlaybooksNavLink";
import { CampaignsNavLink } from "@/app/admin/facilities/_components/CampaignsNavLink";
import { PacketsNavLink } from "@/app/admin/facilities/_components/PacketsNavLink";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { FollowUpNavLink } from "@/app/admin/facilities/_components/FollowUpNavLink";
import { OutreachNavLink } from "@/app/admin/facilities/_components/OutreachNavLink";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { SourceReviewNavLink } from "@/app/admin/facilities/_components/SourceReviewNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { canAccessFacilityAdminTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityAnalyticsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityAdminTools(staff)) {
    redirect("/admin");
  }

  const canFilterReps = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Leadership"
        title="Facility Outreach Analytics"
        description="Track referral-source visits, follow-ups, warm leads, materials dropped, and agent performance."
        actions={
          <div className="flex flex-wrap gap-2">
            <OutreachNavLink />
            <FollowUpNavLink />
            <ReferralsNavLink />
            <SourceReviewNavLink />
            <Link
              href="/admin/facilities"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-sm"
            >
              Admin table
            </Link>
            <Link href="/admin/facilities/new" className={crmPrimaryCtaCls}>
              + Add facility
            </Link>
            <FacilityNotificationBell />
            <CampaignsNavLink />
            <PacketsNavLink />
            <RoutesNavLink />
            <PlaybooksNavLink />
          </div>
        }
      />

      <FacilityAnalyticsView canFilterReps={canFilterReps} />
    </div>
  );
}
