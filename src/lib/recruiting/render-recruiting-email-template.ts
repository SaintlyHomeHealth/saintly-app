import { extractRecruitingLeadFirstName } from "@/lib/recruiting/facebook-recruiting-lead-shared";
import {
  buildRecruitingPaySummary,
  inferRecruitingEmailPayDefaultsForRole,
} from "@/lib/recruiting/recruiting-email-pay";

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
};

const VARIABLE_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

function inferRole(lead: RecruitingLeadEmailContext): string {
  const hay = [lead.license_status, lead.lead_type, lead.form_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\brn\b|registered nurse/.test(hay)) return "RN";
  if (/\blpn\b|licensed practical nurse/.test(hay)) return "LPN";
  if (/\bpta\b|physical therapy assistant/.test(hay)) return "PTA";
  if (/\bpt\b|physical therapist/.test(hay)) return "PT";
  return lead.license_status?.trim() || lead.lead_type?.trim() || "caregiver";
}

export function buildRecruitingEmailVariables(
  lead: RecruitingLeadEmailContext,
  payOverrides?: RecruitingEmailPayOverrides
): Record<string, string> {
  const full_name = lead.full_name.trim() || "there";
  const first_name = extractRecruitingLeadFirstName(full_name);
  const role = inferRole(lead);
  const payDefaults = inferRecruitingEmailPayDefaultsForRole(role);

  const visit_rate = payOverrides?.visit_rate?.trim() || payDefaults.visitRate;
  const soc_rate = payOverrides?.soc_rate?.trim() || payDefaults.socRate;
  const pay_summary =
    payOverrides?.pay_summary?.trim() ||
    buildRecruitingPaySummary(visit_rate, soc_rate, payDefaults.includeSoc);

  return {
    first_name,
    full_name,
    role,
    phone: lead.phone?.trim() || "our office",
    email: lead.email?.trim() || "",
    visit_rate,
    soc_rate,
    pay_summary,
    // Legacy aliases for older templates
    pay_rate: visit_rate,
    city: lead.city?.trim() || "",
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

export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a;white-space:pre-wrap;">${escaped.replace(/\n/g, "<br>")}</div>`;
}
