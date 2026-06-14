import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdmissionHandoffDetailView } from "@/app/admin/intake/_components/AdmissionHandoffDetailView";
import { AdmissionsNavLink } from "@/app/admin/intake/_components/AdmissionsNavLink";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { loadAdmissionHandoffDetail } from "@/lib/crm/lead-admission-handoff";
import { getStaffProfile } from "@/lib/staff-profile";

export default async function AdmissionHandoffDetailPage(props: {
  params: Promise<{ admissionId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff) redirect("/admin");

  const { admissionId } = await props.params;
  const detail = await loadAdmissionHandoffDetail(admissionId, staff);
  if (!detail) notFound();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Admission Handoff"
        title={detail.patient_name}
        description="SOC planning, payer verification, documents, and Alora handoff."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/intake/admissions"
              className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800"
            >
              All handoffs
            </Link>
            <AdmissionsNavLink />
          </div>
        }
      />
      <AdmissionHandoffDetailView admissionId={admissionId} initial={detail} />
    </div>
  );
}
