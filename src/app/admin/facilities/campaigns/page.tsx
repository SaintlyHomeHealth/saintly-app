import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityCampaignsView } from "@/app/admin/facilities/_components/FacilityCampaignsView";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityCampaignsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const canManage = canAccessFacilityAdminTools(staff);

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
        title="Facility Campaigns"
        description="Enroll facilities into outreach playbooks and track progress."
        actions={<FacilitiesFieldNavRow showAnalytics={canManage} />}
      />
      <FacilityCampaignsView canManage={canManage} staffOptions={staffOptions} />
    </div>
  );
}
