import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { FacebookRecruitingLeadDetailClient } from "../_components/FacebookRecruitingLeadDetailClient";

function buildListBackHref(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };
  const keys = ["q", "status", "coverage", "license"] as const;
  for (const k of keys) {
    const v = one(k).trim();
    if (v) u.set(k, v);
  }
  const s = u.toString();
  return s ? `/admin/recruiting-leads?${s}` : "/admin/recruiting-leads";
}

export default async function AdminRecruitingLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { leadId } = await params;
  if (!leadId?.trim()) {
    notFound();
  }

  const sp = await searchParams;

  const { data: lead, error } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select("*")
    .eq("id", leadId.trim())
    .maybeSingle();

  if (error || !lead?.id) {
    notFound();
  }

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Hiring"
        title="Facebook Recruiting Lead"
        description="Review applicant answers and update recruiting follow-up status."
      />
      <FacebookRecruitingLeadDetailClient lead={lead} listBackHref={buildListBackHref(sp)} />
    </div>
  );
}
