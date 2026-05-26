"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { isValidFacebookRecruitingLeadStatus } from "@/lib/recruiting/facebook-recruiting-lead-options";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function requireRecruitingLeadsStaff() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }
  return { user, staff };
}

export async function updateFacebookRecruitingLead(formData: FormData) {
  await requireRecruitingLeadsStaff();

  const leadId = str(formData, "leadId");
  const status = str(formData, "status");
  const notes = str(formData, "notes");
  const returnTo = str(formData, "returnTo") || "/admin/recruiting-leads";

  if (!leadId) {
    redirect(`${returnTo}?err=missing_lead`);
  }

  const patch: Record<string, unknown> = {};
  if (status) {
    if (!isValidFacebookRecruitingLeadStatus(status)) {
      redirect(`${returnTo}?err=invalid_status`);
    }
    patch.status = status;
  }
  patch.notes = notes || null;

  const { error } = await supabaseAdmin.from("facebook_recruiting_leads").update(patch).eq("id", leadId);
  if (error) {
    console.warn("[recruiting-leads] update failed", error.message);
    redirect(`${returnTo}?err=update_failed`);
  }

  revalidatePath("/admin/recruiting-leads");
  revalidatePath(`/admin/recruiting-leads/${leadId}`);
  redirect(returnTo);
}
