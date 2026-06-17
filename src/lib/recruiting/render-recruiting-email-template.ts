import { extractRecruitingLeadFirstName } from "@/lib/recruiting/facebook-recruiting-lead-shared";
import {
  buildRecruitingPaySummary,
  inferRecruitingEmailPayDefaultsForRole,
} from "@/lib/recruiting/recruiting-email-pay";
import type { RecruitingEmailTemplateId } from "@/lib/recruiting/recruiting-email-templates";

export type RecruitingLeadEmailContext = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  license_status?: string | null;
  lead_type?: string | null;
  form_name?: string | null;
};

export type RecruitingEmailPayOverrides = {
  visit_rate?: string | null;
  soc_rate?: string | null;
  pay_summary?: string | null;
  template_id?: RecruitingEmailTemplateId | null;
};

const VARIABLE_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;
const UNRESOLVED_PLACEHOLDER_RE = /\{\{\s*[a-z_]+\s*\}\}/gi;

function inferRole(lead: RecruitingLeadEmailContext): string {
  const hay = [lead.license_status, lead.lead_type, lead.form_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\brn\b|registered nurse/.test(hay)) return "RN";
  if (/\blpn\b|\blvn\b|licensed practical nurse/.test(hay)) return "LPN";
  if (/\bpta\b|physical therapy assistant/.test(hay)) return "PTA";
  if (/\bpt\b|physical therapist/.test(hay)) return "PT";
  return lead.license_status?.trim() || lead.lead_type?.trim() || "";
}

export function buildRecruitingEmailVariables(
  lead: RecruitingLeadEmailContext,
  payOverrides?: RecruitingEmailPayOverrides
): Record<string, string> {
  const fullNameRaw = (lead.full_name ?? "").trim();
  const full_name = fullNameRaw || "there";
  const first_name = extractRecruitingLeadFirstName(fullNameRaw) || "there";
  const role = inferRole(lead);
  const payDefaults = inferRecruitingEmailPayDefaultsForRole(role);

  const visit_rate = payOverrides?.visit_rate?.trim() || payDefaults.visitRate;
  const soc_rate = payOverrides?.soc_rate?.trim() || payDefaults.socRate;
  const pay_summary =
    payOverrides?.pay_summary?.trim() ||
    buildRecruitingPaySummary(
      visit_rate,
      soc_rate,
      payDefaults.includeSoc,
      payOverrides?.template_id ?? undefined
    );

  return {
    first_name,
    full_name,
    role,
    phone: lead.phone?.trim() || "",
    email: lead.email?.trim() || "",
    visit_rate,
    soc_rate,
    pay_summary,
    pay_rate: visit_rate,
    city: "",
  };
}

export function renderRecruitingEmailTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(VARIABLE_RE, (_match, key: string) => {
    const k = key.trim().toLowerCase();
    return variables[k] ?? "";
  });
}

export function findUnresolvedRecruitingEmailPlaceholders(text: string): string[] {
  const matches = text.match(UNRESOLVED_PLACEHOLDER_RE);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\s+/g, "").toLowerCase()))];
}

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${escaped.replace(/\n/g, "<br>")}</div>`;
}
