import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { RecruitingCandidateDetailClient } from "../_components/RecruitingCandidateDetailClient";

function buildListBackHref(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };
  const status = one("status").trim();
  const discipline = one("discipline").trim();
  const area = one("area").trim();
  const source = one("source").trim();
  const followUp = one("followUp").trim();
  if (status) u.set("status", status);
  if (discipline) u.set("discipline", discipline);
  if (area) u.set("area", area);
  if (source) u.set("source", source);
  if (followUp) u.set("followUp", followUp);
  const s = u.toString();
  return s ? `/admin/recruiting?${s}` : "/admin/recruiting";
}

export default async function AdminRecruitingCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ candidateId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { candidateId } = await params;
  if (!candidateId?.trim()) {
    notFound();
  }

  const sp = await searchParams;

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("*")
    .eq("id", candidateId.trim())
    .maybeSingle();

  if (cErr || !candidate?.id) {
    notFound();
  }

  const { data: activityRows, error: aErr } = await supabaseAdmin
    .from("recruiting_candidate_activities")
    .select("id, activity_type, outcome, body, created_at")
    .eq("candidate_id", candidateId.trim())
    .order("created_at", { ascending: false })
    .limit(500);

  if (aErr) {
    console.warn("[recruiting] activities:", aErr.message);
  }

  const { count: noAnswerCount } = await supabaseAdmin
    .from("recruiting_candidate_activities")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidateId.trim())
    .eq("outcome", "no_answer");

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

  const listBackHref = buildListBackHref(sp);

  const errRaw = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const saveError =
    errRaw === "missing_name"
      ? "Full name is required."
      : errRaw === "save_failed"
        ? "Could not save changes."
        : null;

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Talent pipeline"
        title={(candidate as { full_name?: string }).full_name ?? "Candidate"}
        description="Log outreach in seconds — the timeline stays as your source of truth."
        actions={
          <a href={listBackHref} className={crmPrimaryCtaCls}>
            View list
          </a>
        }
      />

      {saveError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {saveError}
        </div>
      ) : null}

      <RecruitingCandidateDetailClient
        candidate={candidate as never}
        activities={(activityRows ?? []) as never}
        staffOptions={staffOptions}
        noAnswerCount={noAnswerCount ?? 0}
        listBackHref={listBackHref}
      />
    </div>
  );
}
