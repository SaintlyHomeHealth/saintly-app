import Link from "next/link";
import { redirect } from "next/navigation";

import { FacilityFinderView } from "@/app/admin/facilities/_components/FacilityFinderView";
import { FieldModeNavLink } from "@/app/admin/facilities/_components/FieldModeNavLink";
import { FacilityNotificationBell } from "@/app/admin/facilities/_components/FacilityNotificationBell";
import { OutreachNavLink } from "@/app/admin/facilities/_components/OutreachNavLink";
import { FollowUpNavLink } from "@/app/admin/facilities/_components/FollowUpNavLink";
import { RouteBuilderNavLink } from "@/app/admin/facilities/_components/RouteBuilderNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function FacilityFinderPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Facility Finder"
        description="Find referral sources near you, filter by specialty, and jump to directions or quick logging."
        actions={
          <div className="flex flex-wrap gap-2">
            <FieldModeNavLink />
            <OutreachNavLink />
            <FollowUpNavLink />
            <Link
              href="/admin/facilities/discover"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-violet-600 bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 sm:text-sm"
            >
              Discover New Facilities
            </Link>
            <RouteBuilderNavLink />
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
          </div>
        }
      />

      <FacilityFinderView />
    </div>
  );
}
