import Link from "next/link";
import { redirect } from "next/navigation";

import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { NewCandidateFormClient } from "./_components/NewCandidateFormClient";

export default async function NewRecruitingCandidatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const errRaw = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const error =
    errRaw === "missing_name"
      ? "Full name is required."
      : errRaw === "save_failed"
        ? "Could not save. Try again."
        : null;

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role, full_name")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as {
    user_id: string;
    email: string | null;
    role: string;
    full_name: string | null;
  }[];

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Talent pipeline"
        title="New candidate"
        description="Create a profile for an Indeed applicant or inbound referral. You can log calls and texts from the candidate record."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/admin/recruiting/new-from-resume"
              className="inline-flex items-center justify-center rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100"
            >
              From resume
            </Link>
            <Link href="/admin/recruiting" className={crmPrimaryCtaCls}>
              Back to list
            </Link>
          </div>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {error}
        </div>
      ) : null}

      <NewCandidateFormClient staffOptions={staffOptions} />
    </div>
  );
}
