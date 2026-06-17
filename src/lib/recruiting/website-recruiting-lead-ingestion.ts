import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ingestFacebookRecruitingLead,
  type IngestFacebookRecruitingLeadResult,
} from "@/lib/recruiting/facebook-recruiting-lead-ingestion";

import {
  WEBSITE_CAREERS_FORM_NAME,
  WEBSITE_RECRUITING_LEAD_TYPE,
  WEBSITE_RECRUITING_PIPELINE,
  WEBSITE_RECRUITING_SOURCE,
} from "@/lib/recruiting/website-recruiting-lead-constants";
export type WebsiteRecruitingLeadInput = {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  address?: string | null;
  position: string;
  license_number?: string | null;
  years_experience?: string | null;
  preferred_hours?: string | null;
  available_start_date?: string | null;
  experience_message?: string | null;
  resume_url?: string | null;
  fbclid?: string | null;
  submitted_at: string;
};

function buildHomeHealthExperience(input: WebsiteRecruitingLeadInput): string | null {
  const parts = [
    input.years_experience?.trim() ? `Years: ${input.years_experience.trim()}` : null,
    input.experience_message?.trim() ? input.experience_message.trim() : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n").slice(0, 4000) : null;
}

function buildCoverageArea(input: WebsiteRecruitingLeadInput): string | null {
  const parts = [input.address?.trim(), input.city?.trim(), input.state?.trim(), input.zip?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ").slice(0, 200) : null;
}

function buildNotes(input: WebsiteRecruitingLeadInput): string {
  const lines = [
    "Employment application (Saintly website careers form)",
    "",
    `Role: ${input.position}`,
    input.license_number?.trim() ? `License #: ${input.license_number.trim()}` : null,
    input.years_experience?.trim() ? `Experience: ${input.years_experience.trim()}` : null,
    input.preferred_hours?.trim() ? `Hours: ${input.preferred_hours.trim()}` : null,
    input.available_start_date?.trim() ? `Available start: ${input.available_start_date.trim()}` : null,
    "",
    input.experience_message?.trim() ? `Message / experience:\n${input.experience_message.trim()}` : null,
    input.resume_url?.trim() ? `Resume link: ${input.resume_url.trim()}` : null,
  ].filter((x) => x != null && String(x).trim() !== "");
  return lines.join("\n").slice(0, 8000);
}

/**
 * Website careers / employment form → `facebook_recruiting_leads` (Recruiting Leads admin page).
 */
export async function ingestWebsiteRecruitingLead(
  supabase: SupabaseClient,
  input: WebsiteRecruitingLeadInput
): Promise<IngestFacebookRecruitingLeadResult> {
  const rawPayload = {
    channel: "website_careers_form",
    pipeline: WEBSITE_RECRUITING_PIPELINE,
    source: WEBSITE_RECRUITING_SOURCE,
    source_detail: WEBSITE_CAREERS_FORM_NAME,
    lead_type: WEBSITE_RECRUITING_LEAD_TYPE,
    submitted_at: input.submitted_at,
    first_name: input.first_name,
    last_name: input.last_name,
    full_name: input.full_name,
    email: input.email,
    phone: input.phone,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    address: input.address ?? null,
    position: input.position,
    license_number: input.license_number ?? null,
    years_experience: input.years_experience ?? null,
    preferred_hours: input.preferred_hours ?? null,
    available_start_date: input.available_start_date ?? null,
    experience_message: input.experience_message ?? null,
    resume_url: input.resume_url ?? null,
    fbclid: input.fbclid ?? null,
  };

  const result = await ingestFacebookRecruitingLead(supabase, {
    payload: {
      full_name: input.full_name,
      phone: input.phone,
      email: input.email,
      city: input.city ?? undefined,
      form_name: WEBSITE_CAREERS_FORM_NAME,
      license_status: input.license_number?.trim() || input.position,
      home_health_experience: buildHomeHealthExperience(input) ?? undefined,
      visits_per_week: input.preferred_hours ?? undefined,
      coverage_area: buildCoverageArea(input) ?? undefined,
      start_date: input.available_start_date ?? undefined,
      lead_type: WEBSITE_RECRUITING_LEAD_TYPE,
      source: WEBSITE_RECRUITING_SOURCE,
    },
    rawBodyText: JSON.stringify(rawPayload),
  });

  if (!result.ok) {
    return result;
  }

  const notes = buildNotes(input);
  if (notes.trim()) {
    await supabase.from("facebook_recruiting_leads").update({ notes }).eq("id", result.leadId);
  }

  return result;
}
