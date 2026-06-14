import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityOutreachView } from "@/app/admin/facilities/_components/FacilityOutreachView";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityOutreachPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const showAdmin = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Today's Outreach"
        description="Plan visits, follow up with referral sources, and log activity from the field."
        actions={<FacilitiesFieldNavRow showAnalytics={showAdmin} />}
      />

      <FacilityOutreachView showManagerAnalyticsLink={showAdmin} currentUserId={staff.user_id} />
    </div>
  );
}
