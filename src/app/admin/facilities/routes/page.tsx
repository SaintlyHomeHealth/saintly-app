import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityRoutesView } from "@/app/admin/facilities/_components/FacilityRoutesView";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  getStaffProfile,
} from "@/lib/staff-profile";

export default async function FacilityRoutesPage() {
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
        title="Saved Routes"
        description="View planned outreach routes and route completion."
        actions={
          <div className="flex flex-wrap gap-2">
            <FacilitiesFieldNavRow showAnalytics={canManageAll} />
            <RoutesNavLink />
          </div>
        }
      />
      <FacilityRoutesView
        staffOptions={staffOptions}
        currentUserId={staff.user_id}
        canManageAll={canManageAll}
      />
    </div>
  );
}
