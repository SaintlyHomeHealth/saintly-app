import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityPlaybooksView } from "@/app/admin/facilities/_components/FacilityPlaybooksView";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityPlaybooksPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const canEdit = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Outreach Playbooks"
        description="Create repeatable outreach sequences for referral-source growth."
        actions={<FacilitiesFieldNavRow showAnalytics={canEdit} />}
      />
      <FacilityPlaybooksView canEdit={canEdit} />
    </div>
  );
}
