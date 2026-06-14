import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FacilityReferralSourceReviewView } from "@/app/admin/facilities/_components/FacilityReferralSourceReviewView";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools, getStaffProfile } from "@/lib/staff-profile";

export default async function FacilitySourceReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const leadRaw = typeof sp.lead === "string" ? sp.lead : Array.isArray(sp.lead) ? sp.lead[0] : "";
  const canManage = canAccessFacilityAdminTools(staff);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Facilities"
        title="Referral Source Review"
        description="Match QR and referral-link submissions to the correct facility and contact."
        actions={
          <div className="flex flex-wrap gap-2">
            <ReferralsNavLink />
            <Link
              href="/admin/facilities/source-links"
              className="inline-flex min-h-[2.75rem] items-center rounded-[20px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm sm:text-sm"
            >
              Referral Links
            </Link>
            <Link
              href="/admin/facilities"
              className="inline-flex min-h-[2.75rem] items-center rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm sm:text-sm"
            >
              Facilities hub
            </Link>
          </div>
        }
      />

      <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
        <FacilityReferralSourceReviewView canManage={canManage} initialLeadId={leadRaw} />
      </Suspense>
    </div>
  );
}
