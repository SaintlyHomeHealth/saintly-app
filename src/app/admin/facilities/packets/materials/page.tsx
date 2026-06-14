import { redirect } from "next/navigation";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { FacilityPacketMaterialsAdmin } from "@/app/admin/facilities/_components/FacilityPacketMaterialsAdmin";
import { PacketsNavLink } from "@/app/admin/facilities/_components/PacketsNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  getStaffProfile,
} from "@/lib/staff-profile";

export default async function FacilityPacketMaterialsPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const canManageAll = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Packet Materials"
        description="Manage Saintly referral packets, flyers, and links used for automated email and fax delivery."
        actions={
          <div className="flex flex-wrap gap-2">
            <FacilitiesFieldNavRow showAnalytics={canManageAll} />
            <PacketsNavLink />
          </div>
        }
      />
      <FacilityPacketMaterialsAdmin canManage={canManageAll} />
    </div>
  );
}
