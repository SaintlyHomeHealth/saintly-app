import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityPacketsView } from "@/app/admin/facilities/_components/FacilityPacketsView";
import { PacketsNavLink } from "@/app/admin/facilities/_components/PacketsNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  getStaffProfile,
} from "@/lib/staff-profile";

export default async function FacilityPacketsPage() {
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
        title="Packet Requests"
        description="Track facility requests for Saintly packets, emails, faxes, and dropped materials."
        actions={
          <div className="flex flex-wrap gap-2">
            <FacilitiesFieldNavRow showAnalytics={canManageAll} />
            <PacketsNavLink />
          </div>
        }
      />
      <FacilityPacketsView
        staffOptions={staffOptions}
        currentUserId={staff.user_id}
        canManageAll={canManageAll}
      />
    </div>
  );
}
