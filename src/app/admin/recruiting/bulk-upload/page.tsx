import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { BulkResumeUploadClient } from "./_components/BulkResumeUploadClient";

export default async function BulkResumeUploadPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Talent pipeline"
        title="Bulk resume upload"
        description="Upload many resumes at once. Each file is parsed with the same pipeline as single upload; strong matches are created automatically. Duplicates are skipped."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/recruiting"
              className="inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Back to list
            </Link>
            <Link href="/admin/recruiting/new-from-resume" className={crmPrimaryCtaCls}>
              Single resume
            </Link>
          </div>
        }
      />

      <BulkResumeUploadClient />
    </div>
  );
}
