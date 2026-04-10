import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { FacilityForm, type FacilityRecord } from "@/app/admin/facilities/_components/FacilityForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function AdminFacilityEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { facilityId } = await params;
  if (!facilityId?.trim()) {
    notFound();
  }

  const sp = await searchParams;
  const errRaw = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const errorMessage =
    errRaw === "missing_name"
      ? "Facility name is required."
      : errRaw === "save_failed"
        ? "Could not save. Try again or contact support."
        : null;

  const { data: row, error } = await supabaseAdmin.from("facilities").select("*").eq("id", facilityId.trim()).maybeSingle();

  if (error || !row?.id) {
    notFound();
  }

  const facility = row as unknown as FacilityRecord;

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
        title="Edit facility"
        description={facility.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/facilities/${facility.id}`} className={crmPrimaryCtaCls}>
              View profile
            </Link>
            <Link
              href="/admin/facilities"
              className="rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:text-sm"
            >
              All facilities
            </Link>
          </div>
        }
      />

      <FacilityForm mode="edit" facility={facility} staffOptions={staffOptions} errorMessage={errorMessage} />
    </div>
  );
}
