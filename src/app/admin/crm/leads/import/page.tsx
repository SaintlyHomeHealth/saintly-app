import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { LeadCsvImportClient } from "./lead-csv-import-client";

export default async function AdminCrmLeadsCsvImportPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Pipeline"
        title="Import leads (CSV)"
        description="Facebook Lead Ads CSV export — same CRM shape as automation ingestion."
      />
      <LeadCsvImportClient />
    </div>
  );
}
