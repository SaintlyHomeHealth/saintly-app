import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdmissionsNavLink } from "@/app/admin/intake/_components/AdmissionsNavLink";
import { AdmissionHandoffsView } from "@/app/admin/intake/_components/AdmissionHandoffsView";
import { ReferralsNavLink } from "@/app/admin/facilities/_components/ReferralsNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

export default async function AdmissionHandoffsPage() {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    redirect("/admin");
  }

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .order("full_name");

  const staffOptions = (staffRows ?? []).map((s) => {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    return { user_id: row.user_id, label: staffPrimaryLabel(row) };
  });

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Intake"
        title="Admission Handoffs"
        description="Track accepted referrals from intake approval to SOC readiness."
        actions={
          <div className="flex flex-wrap gap-2">
            <ReferralsNavLink />
            <AdmissionsNavLink className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" />
          </div>
        }
      />
      <Suspense fallback={<p className="text-sm text-slate-600">Loading…</p>}>
        <AdmissionHandoffsView staffOptions={staffOptions} />
      </Suspense>
    </div>
  );
}
