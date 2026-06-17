import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { PtColdCallingView } from "./_components/PtColdCallingView";

export const metadata = {
  title: "PT/PTA Cold Calling",
};

export default async function PtColdCallingPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Recruiting"
        title="PT/PTA Cold Calling"
        description="Search physical therapy clinics by ZIP code, quick add recruiting call targets, track who you spoke with, and schedule follow-ups."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/recruiting"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-sky-200 hover:bg-sky-50/60"
            >
              Recruiting Candidates
            </Link>
          </div>
        }
      />
      <PtColdCallingView />
    </div>
  );
}
