import { redirect } from "next/navigation";

import { LeadWorkspace } from "../lead-workspace";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

  const supabase = await createServerSupabaseClient();
  const { data: staffRows } = await supabase
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
    <LeadWorkspace mode="new" createErrorCode={manualErr} staffOptions={staffOptions} initialFbclid={fbclid} />
  );
}
