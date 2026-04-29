import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { ensureRecruitingCandidateCrmContact } from "@/lib/recruiting/recruiting-crm-contact-sync";
import { buildWorkspaceKeypadCallHref } from "@/lib/workspace-phone/launch-urls";

import { RecruitingCandidateDetailClient } from "../_components/RecruitingCandidateDetailClient";

function buildListBackHref(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };
  const keys = [
    "status",
    "discipline",
    "area",
    "city",
    "coverage",
    "name",
    "source",
    "followUp",
    "interest",
    "tags",
    "lastContactFrom",
    "lastContactTo",
  ] as const;
  for (const k of keys) {
    const v = one(k).trim();
    if (v) u.set(k, v);
  }
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

  const ensured = await ensureRecruitingCandidateCrmContact(supabaseAdmin, candidateId.trim());
  const keypadCallHref = ensured.dialE164
    ? buildWorkspaceKeypadCallHref({
        dial: ensured.dialE164,
        contactId: ensured.contactId ?? undefined,
        contextName: ensured.contextName ?? undefined,
        candidateId: candidateId.trim(),
        source: "recruiting",
        placeCall: false,
      })
    : null;

  const { data: activityRows, error: aErr } = await supabaseAdmin
    .from("recruiting_candidate_activities")
    .select("id, activity_type, outcome, body, created_at, created_by")
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

  const actorLabels = Object.fromEntries(staffOptions.map((s) => [s.user_id, staffPrimaryLabel(s)]));

  const listBackHref = buildListBackHref(sp);

  const errRaw = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const inviteErr = typeof sp.inviteErr === "string" ? sp.inviteErr.trim() : Array.isArray(sp.inviteErr) ? String(sp.inviteErr[0] ?? "").trim() : "";
  const inviteOk = typeof sp.inviteOk === "string" ? sp.inviteOk.trim() : Array.isArray(sp.inviteOk) ? String(sp.inviteOk[0] ?? "").trim() : "";
  const inviteApplicantId =
    typeof sp.inviteApplicantId === "string"
      ? sp.inviteApplicantId.trim()
      : Array.isArray(sp.inviteApplicantId)
        ? String(sp.inviteApplicantId[0] ?? "").trim()
        : "";
  const inviteEmailWarn =
    typeof sp.inviteEmailWarn === "string"
      ? sp.inviteEmailWarn.trim()
      : Array.isArray(sp.inviteEmailWarn)
        ? String(sp.inviteEmailWarn[0] ?? "").trim()
        : "";
  const saveError =
    errRaw === "missing_name"
      ? "Full name is required."
      : errRaw === "save_failed"
        ? "Could not save changes."
        : errRaw === "no_phone"
          ? "Add a phone number on this candidate to call from the workspace keypad."
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

      {inviteErr ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {inviteErr}
        </div>
      ) : null}

      {inviteOk ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
          Employee onboarding invite sent.
          {inviteApplicantId ? (
            <>
              {" "}
              <a
                href={`/admin/employees/${inviteApplicantId}`}
                className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
              >
                Open employee record
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {inviteEmailWarn ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          <span className="font-semibold">Text was sent, but email did not send.</span> {inviteEmailWarn}
        </div>
      ) : null}

      <RecruitingCandidateDetailClient
        candidate={candidate as never}
        activities={(activityRows ?? []) as never}
        staffOptions={staffOptions}
        noAnswerCount={noAnswerCount ?? 0}
        listBackHref={listBackHref}
        viewerUserId={staff.user_id}
        actorLabels={actorLabels}
        keypadCallHref={keypadCallHref}
      />
    </div>
  );
}
