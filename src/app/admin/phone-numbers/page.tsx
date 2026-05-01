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

  const [{ data: rows, error }, owners, { data: staffForTransferRaw, error: transferStaffErr }] =
    await Promise.all([
      supabaseAdmin
        .from("twilio_phone_numbers")
        .select(
          "id, phone_number, twilio_sid, label, number_type, status, assigned_user_id, assigned_staff_profile_id, is_primary_company_number, is_company_backup_number, sms_enabled, voice_enabled"
        )
        .order("created_at", { ascending: false }),
      loadAssignableLeadOwners(),
      supabaseAdmin
        .from("staff_profiles")
        .select("user_id, full_name, email, is_active")
        .not("user_id", "is", null),
    ]);

  if (error) {
    console.warn("[admin/phone-numbers] load:", error.message);
  }
  if (transferStaffErr) {
    console.warn("[admin/phone-numbers] transfer staff list:", transferStaffErr.message);
  }

  type TransferStaffOption = {
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_active: boolean;
  };

  const staffLoginRows: TransferStaffOption[] = (staffForTransferRaw ?? [])
    .map((r) => ({
      user_id: typeof r.user_id === "string" ? r.user_id.trim() : "",
      full_name: typeof r.full_name === "string" ? r.full_name : null,
      email: typeof r.email === "string" ? r.email : null,
      is_active: r.is_active !== false,
    }))
    .filter((r) => r.user_id.length > 0);

  function transferStaffSortKey(s: TransferStaffOption): string {
    const a = (s.full_name ?? "").trim() || (s.email ?? "").trim() || s.user_id;
    return a.toLocaleLowerCase("en-US");
  }

  staffLoginRows.sort((a, b) => transferStaffSortKey(a).localeCompare(transferStaffSortKey(b), "en-US"));

  const transferFromStaff = staffLoginRows;
  const transferToStaff = staffLoginRows.filter((s) => s.is_active);

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
      <TwilioPhoneNumbersAdminClient
        initialNumbers={(rows ?? []) as never}
        assignableStaff={assignableStaff}
        transferFromStaff={transferFromStaff}
        transferToStaff={transferToStaff}
      />
    </div>
  );
}
