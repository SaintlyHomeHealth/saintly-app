import Link from "next/link";
import { redirect } from "next/navigation";

import { FacilityForm } from "@/app/admin/facilities/_components/FacilityForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function AdminFacilityNewPage({
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
  const errorMessage =
    errRaw === "missing_name"
      ? "Facility name is required."
      : errRaw === "save_failed"
        ? "Could not save. Try again or contact support."
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
        eyebrow="Outside sales CRM"
        title="New facility"
        description="Add a referral-source building to track visits, contacts, and follow-ups."
        actions={
          <Link href="/admin/facilities" className={crmPrimaryCtaCls}>
            Back to list
          </Link>
        }
      />

      <FacilityForm mode="create" staffOptions={staffOptions} errorMessage={errorMessage} />
    </div>
  );
}
