import { redirect } from "next/navigation";

import { LeadWorkspace } from "../lead-workspace";
import { loadAssignableLeadOwners } from "@/lib/crm/assignable-lead-owners";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export default async function AdminCrmLeadNewPage({
  searchParams,
}: {
  searchParams: Promise<{ manualError?: string; fbclid?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const params = await searchParams;
  const manualErr = typeof params.manualError === "string" ? params.manualError.trim() : "";
  const fbclid = typeof params.fbclid === "string" ? params.fbclid.trim() : "";

  const staffOptions = await loadAssignableLeadOwners();

  return (
    <LeadWorkspace mode="new" createErrorCode={manualErr} staffOptions={staffOptions} initialFbclid={fbclid} />
  );
}
