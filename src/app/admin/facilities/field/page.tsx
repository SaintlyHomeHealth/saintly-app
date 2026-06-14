import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityFieldModeView } from "@/app/admin/facilities/_components/FacilityFieldModeView";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityFieldModePage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const showAdmin = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Field Mode"
        description="Work today's route, log visits, and sync activity from the field."
        actions={<FacilitiesFieldNavRow showAnalytics={showAdmin} />}
      />
      <FacilityFieldModeView currentUserId={staff.user_id} />
    </div>
  );
}
