import { redirect } from "next/navigation";
import dynamic from "next/dynamic";

import { FacilitiesFieldNavRow } from "@/app/admin/facilities/_components/FacilitiesHubCards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

const FacilityOutreachView = dynamic(
  () =>
    import("@/app/admin/facilities/_components/FacilityOutreachView").then((m) => m.FacilityOutreachView),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[20rem] animate-pulse rounded-[28px] border border-slate-200 bg-slate-50/80" aria-hidden />
    ),
  }
);

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
