import Link from "next/link";
import { redirect } from "next/navigation";

import { FacilitySourceLinksView } from "@/app/admin/facilities/_components/FacilitySourceLinksView";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { SourceReviewNavLink } from "@/app/admin/facilities/_components/SourceReviewNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilitySourceLinksPage() {
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
        eyebrow="Facilities"
        title="Referral Links & QR Codes"
        description="Create reusable referral links for reps, campaigns, materials, and facilities."
        actions={
          <div className="flex flex-wrap gap-2">
            <ReferralsNavLink />
            <SourceReviewNavLink />
            <Link
              href="/admin/facilities"
              className="inline-flex min-h-[2.75rem] items-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm sm:text-sm"
            >
              Facilities hub
            </Link>
          </div>
        }
      />

      <FacilitySourceLinksView canManage={canManage} staffOptions={staffOptions} />
    </div>
  );
}
