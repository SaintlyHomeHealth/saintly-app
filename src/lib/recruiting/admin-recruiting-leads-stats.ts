import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  attachAdminRecruitingLeadsListPredicates,
  type AdminRecruitingLeadsListFilters,
  type AdminRecruitingLeadsListQueryDeps,
} from "@/lib/recruiting/admin-recruiting-leads-list-filters";
import { phoenixStartOfTodayIso } from "@/lib/recruiting/phoenix-time";

const RESUME_SOURCE_OR =
  "source.eq.manual_resume_upload,source.ilike.%manual resume%,form_name.ilike.%manual resume%";

const FORM_FACEBOOK_SOURCE_OR =
  "source.eq.facebook,source.eq.website,source.eq.website_form,source.eq.careers_form,source.ilike.%facebook%,source.ilike.%website%,source.ilike.%careers%,form_name.ilike.%facebook%,form_name.ilike.%careers%";

async function countLeads(
  supabase: SupabaseClient,
  apply?: (q: ReturnType<SupabaseClient["from"]>) => ReturnType<SupabaseClient["from"]>
): Promise<number> {
  let q = supabase.from("facebook_recruiting_leads").select("id", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) {
    console.warn("[recruiting/stats] count:", error.message);
    return 0;
  }
  return count ?? 0;
}

export type RecruitingLeadWorkspaceStats = {
  total: number;
  newLeads: number;
  newToday: number;
  formFacebookLeads: number;
  resumeUploads: number;
};

export type RecruitingLeadTabCounts = {
  all: number;
  form_facebook: number;
  resume_uploads: number;
  new_today: number;
};

export async function fetchRecruitingLeadWorkspaceStats(
  supabase: SupabaseClient
): Promise<RecruitingLeadWorkspaceStats> {
  const todayStart = phoenixStartOfTodayIso();
  const [total, newLeads, newToday, formFacebookLeads, resumeUploads] = await Promise.all([
    countLeads(supabase),
    countLeads(supabase, (q) => q.eq("status", "New")),
    countLeads(supabase, (q) => q.gte("created_at", todayStart)),
    countLeads(supabase, (q) => q.or(FORM_FACEBOOK_SOURCE_OR)),
    countLeads(supabase, (q) => q.or(RESUME_SOURCE_OR)),
  ]);
  return { total, newLeads, newToday, formFacebookLeads, resumeUploads };
}

export async function fetchRecruitingLeadTabCounts(
  supabase: SupabaseClient
): Promise<RecruitingLeadTabCounts> {
  const todayStart = phoenixStartOfTodayIso();
  const [all, form_facebook, resume_uploads, new_today] = await Promise.all([
    countLeads(supabase),
    countLeads(supabase, (q) => q.or(FORM_FACEBOOK_SOURCE_OR)),
    countLeads(supabase, (q) => q.or(RESUME_SOURCE_OR)),
    countLeads(supabase, (q) => q.gte("created_at", todayStart)),
  ]);
  return { all, form_facebook, resume_uploads, new_today };
}

export async function countFilteredRecruitingLeads(
  supabase: SupabaseClient,
  filters: AdminRecruitingLeadsListFilters,
  deps: AdminRecruitingLeadsListQueryDeps
): Promise<number> {
  let q = supabase.from("facebook_recruiting_leads").select("id", { count: "exact", head: true });
  q = attachAdminRecruitingLeadsListPredicates(q, filters, deps) as typeof q;
  const { count, error } = await q;
  if (error) {
    console.warn("[recruiting/list] filtered count:", error.message);
    return 0;
  }
  return count ?? 0;
}
