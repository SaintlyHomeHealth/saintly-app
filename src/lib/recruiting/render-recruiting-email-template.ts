import { extractRecruitingLeadFirstName } from "@/lib/recruiting/facebook-recruiting-lead-shared";

export type RecruitingLeadEmailContext = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  license_status?: string | null;
  lead_type?: string | null;
  form_name?: string | null;
};

const VARIABLE_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

function inferRole(lead: RecruitingLeadEmailContext): string {
  const hay = [lead.license_status, lead.lead_type, lead.form_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\brn\b|registered nurse/.test(hay)) return "RN";
  if (/\blpn\b|licensed practical nurse/.test(hay)) return "LPN";
  if (/\bpt\b|physical therapist/.test(hay)) return "Physical Therapist";
  return lead.license_status?.trim() || lead.lead_type?.trim() || "caregiver";
}

function inferPayRates(role: string): { pay_rate: string; soc_rate: string } {
  const r = role.toLowerCase();
  if (r.includes("lpn")) return { pay_rate: "$60", soc_rate: "N/A" };
  if (r.includes("rn")) return { pay_rate: "$80", soc_rate: "$110" };
  return { pay_rate: "competitive rates", soc_rate: "competitive SOC rates" };
}

export function buildRecruitingEmailVariables(
  lead: RecruitingLeadEmailContext
): Record<string, string> {
  const full_name = lead.full_name.trim() || "there";
  const first_name = extractRecruitingLeadFirstName(full_name);
  const role = inferRole(lead);
  const { pay_rate, soc_rate } = inferPayRates(role);

  return {
    first_name,
    full_name,
    role,
    phone: lead.phone?.trim() || "our office",
    email: lead.email?.trim() || "",
    city: lead.city?.trim() || "your area",
    pay_rate,
    soc_rate,
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
