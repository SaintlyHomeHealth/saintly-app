import { redirect } from "next/navigation";

import { FieldModeNavLink } from "@/app/admin/facilities/_components/FieldModeNavLink";
import { FacilityRouteDetailView } from "@/app/admin/facilities/_components/FacilityRouteDetailView";
import { RoutesNavLink } from "@/app/admin/facilities/_components/RoutesNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  getStaffProfile,
} from "@/lib/staff-profile";

type PageProps = { params: Promise<{ routeId: string }> };

export default async function FacilityRouteDetailPage({ params }: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const { routeId } = await params;
  const canManageAll = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Field sales"
        title="Route Plan"
        description="Track stops, check-ins, visit logs, and completion."
        actions={
          <div className="flex flex-wrap gap-2">
            <FieldModeNavLink />
            <RoutesNavLink />
          </div>
        }
      />
      <FacilityRouteDetailView routeId={routeId} canManageAll={canManageAll} currentUserId={staff.user_id} />
    </div>
  );
}
