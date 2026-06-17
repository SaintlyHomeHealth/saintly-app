/**
 * Unified recruiting lead source labels for admin list badges.
 */

export type RecruitingLeadSourceBadge =
  | "Facebook"
  | "Website Careers"
  | "Manual Resume Upload"
  | "Legacy CRM Lead"
  | "Other";

const FACEBOOK_NEEDLES = ["facebook", "meta lead", "lead ads"] as const;
const WEBSITE_NEEDLES = ["website", "careers", "employment form", "saintly website"] as const;

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function rawPipeline(rawPayload: unknown): string {
  if (!rawPayload || typeof rawPayload !== "object") return "";
  const root = rawPayload as Record<string, unknown>;
  const latest = root.latest;
  if (latest && typeof latest === "object") {
    const pipeline = (latest as Record<string, unknown>).pipeline;
    if (typeof pipeline === "string") return pipeline.trim().toLowerCase();
  }
  const pipeline = root.pipeline;
  return typeof pipeline === "string" ? pipeline.trim().toLowerCase() : "";
}

export function recruitingLeadSourceBadge(input: {
  source?: string | null;
  form_name?: string | null;
  raw_payload?: unknown;
}): RecruitingLeadSourceBadge {
  const source = norm(input.source);
  const formName = norm(input.form_name);
  const combined = `${source} ${formName}`.trim();
  const pipeline = rawPipeline(input.raw_payload);

  if (source === "legacy_crm_lead" || combined.includes("legacy crm")) {
    return "Legacy CRM Lead";
  }
  if (source === "manual_resume_upload" || combined.includes("manual resume")) {
    return "Manual Resume Upload";
  }
  if (source === "website" || WEBSITE_NEEDLES.some((n) => combined.includes(n))) {
    return "Website Careers";
  }
  if (
    source.includes("facebook") ||
    FACEBOOK_NEEDLES.some((n) => combined.includes(n)) ||
    (pipeline === "recruiting" && combined.includes("facebook"))
  ) {
    return "Facebook";
  }
  if (pipeline === "recruiting" && (combined.includes("career") || combined.includes("employment"))) {
    return "Website Careers";
  }
  return "Other";
}

export function recruitingLeadSourceBadgeClass(badge: RecruitingLeadSourceBadge): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  switch (badge) {
    case "Facebook":
      return `${base} border-blue-200 bg-blue-50 text-blue-900`;
    case "Website Careers":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-900`;
    case "Manual Resume Upload":
      return `${base} border-violet-200 bg-violet-50 text-violet-900`;
    case "Legacy CRM Lead":
      return `${base} border-amber-200 bg-amber-50 text-amber-900`;
    default:
      return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  }
}
