import Link from "next/link";
import { redirect } from "next/navigation";

import { AnalyticsNavLink } from "@/app/admin/facilities/_components/AnalyticsNavLink";
import { FacilityFollowUpsView } from "@/app/admin/facilities/_components/FacilityFollowUpsView";
import { FacilityNotificationBell } from "@/app/admin/facilities/_components/FacilityNotificationBell";
import { FollowUpNavLink } from "@/app/admin/facilities/_components/FollowUpNavLink";
import { OutreachNavLink } from "@/app/admin/facilities/_components/OutreachNavLink";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { RouteBuilderNavLink } from "@/app/admin/facilities/_components/RouteBuilderNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { FACILITY_TYPE_OPTIONS } from "@/lib/crm/facility-options";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

export default async function FacilityFollowUpsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const canFilterReps = canAccessFacilityAdminTools(staff);

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .order("full_name");

  const staffOptions = (staffRows ?? []).map((s) => {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    return {
      user_id: row.user_id,
      label: staffPrimaryLabel(row),
    };
  });

  const { data: cityRows } = await supabaseAdmin.from("facilities").select("city").limit(2000);
  const cityOptions = [
    ...new Set(
      (cityRows ?? [])
        .map((r) => (r as { city: string | null }).city)
        .filter((c): c is string => Boolean(c && c.trim()))
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Facility Follow-Ups"
        description="Manage referral-source follow-up tasks and next steps."
        actions={
          <div className="flex flex-wrap gap-2">
            <OutreachNavLink />
            <ReferralsNavLink />
            <AnalyticsNavLink />
            <Link
              href="/admin/facilities/finder"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-emerald-600 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 sm:text-sm"
            >
              Find Near Me
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

      <FacilityFollowUpsView
        currentUserId={staff.user_id}
        canFilterReps={canFilterReps}
        staffOptions={staffOptions}
        cityOptions={cityOptions}
        typeOptions={[...FACILITY_TYPE_OPTIONS]}
      />
    </div>
  );
}
