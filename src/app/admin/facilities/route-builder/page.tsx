import Link from "next/link";
import { redirect } from "next/navigation";

import { FieldModeNavLink } from "@/app/admin/facilities/_components/FieldModeNavLink";
import { FacilityNotificationBell } from "@/app/admin/facilities/_components/FacilityNotificationBell";
import { FacilityRouteBuilderViewClient } from "@/app/admin/facilities/_components/FacilityRouteBuilderViewClient";
import { OutreachNavLink } from "@/app/admin/facilities/_components/OutreachNavLink";
import { FollowUpNavLink } from "@/app/admin/facilities/_components/FollowUpNavLink";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  getStaffProfile,
} from "@/lib/staff-profile";

export default async function FacilityRouteBuilderPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const canManageAll = canAccessFacilityAdminTools(staff);

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .eq("is_active", true)
    .order("full_name");

  const staffOptions = (staffRows ?? []).map((s) => {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    return { user_id: row.user_id, label: staffPrimaryLabel(row) };
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Route Builder"
        description="Plan today's facility stops and open directions in Apple Maps."
        actions={
          <div className="flex flex-wrap gap-2">
            <FieldModeNavLink />
            <OutreachNavLink />
            <FollowUpNavLink />
            <RoutesNavLink />
            <Link
              href="/admin/facilities/finder"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-sm"
            >
              Facility Finder
            </Link>
            <Link
              href="/admin/facilities/discover"
              className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-sm"
            >
              Discovery
            </Link>
            <Link href="/admin/facilities/new" className={crmPrimaryCtaCls}>
              + Add facility
            </Link>
            <FacilityNotificationBell />
          </div>
        }
      />

      <FacilityRouteBuilderViewClient
        currentUserId={staff.user_id}
        staffOptions={staffOptions}
        canAssignOthers={canManageAll}
      />
    </div>
  );
}
