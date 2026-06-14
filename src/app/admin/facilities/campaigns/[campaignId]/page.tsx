import Link from "next/link";
import { redirect } from "next/navigation";

import { FacilityCampaignDetailView } from "@/app/admin/facilities/_components/FacilityCampaignDetailView";
import { CampaignsNavLink } from "@/app/admin/facilities/_components/CampaignsNavLink";
import { PlaybooksNavLink } from "@/app/admin/facilities/_components/PlaybooksNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilityCampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const { campaignId } = await params;
  const canManage = canAccessFacilityAdminTools(staff);

  const { data: staffRows } = canManage
    ? await supabaseAdmin
        .from("staff_profiles")
        .select("user_id, full_name, email")
        .eq("is_active", true)
        .order("full_name")
    : { data: [] };

  const staffOptions = (staffRows ?? []).map((s) => {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    return { user_id: row.user_id, label: staffPrimaryLabel(row) };
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Campaign"
        title="Campaign detail"
        description="Track enrollments, due steps, and referral outcomes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/facilities/campaigns"
              className="inline-flex min-h-[2.75rem] items-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm sm:text-sm"
            >
              All Campaigns
            </Link>
            <PlaybooksNavLink />
            <CampaignsNavLink />
          </div>
        }
      />
      <FacilityCampaignDetailView campaignId={campaignId} canManage={canManage} staffOptions={staffOptions} />
    </div>
  );
}
