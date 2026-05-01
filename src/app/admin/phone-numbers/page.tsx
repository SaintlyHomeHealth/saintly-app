import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { loadAssignableLeadOwners } from "@/lib/crm/assignable-lead-owners";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

import { TwilioPhoneNumbersAdminClient } from "./_components/TwilioPhoneNumbersAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPhoneNumbersPage() {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    redirect("/admin");
  }

  const [{ data: rows, error }, owners] = await Promise.all([
    supabaseAdmin
      .from("twilio_phone_numbers")
      .select(
        "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, is_company_backup_number, sms_enabled, voice_enabled"
      )
      .order("created_at", { ascending: false }),
    loadAssignableLeadOwners(),
  ]);

  if (error) {
    console.warn("[admin/phone-numbers] load:", error.message);
  }

  const assignableStaff = owners.map((o) => ({
    user_id: o.user_id,
    label:
      (o.full_name ?? "").trim() ||
      (o.email ?? "").trim() ||
      o.user_id.slice(0, 8) + "…",
  }));
  assignableStaff.sort((a, b) => a.label.localeCompare(b.label, "en-US", { sensitivity: "base" }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <AdminPageHeader title="Twilio phone numbers" subtitle="Assign staff-owned lines and manage company inventory." />
      <TwilioPhoneNumbersAdminClient initialNumbers={(rows ?? []) as never} assignableStaff={assignableStaff} />
    </div>
  );
}
