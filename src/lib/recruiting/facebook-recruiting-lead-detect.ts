/** Detect Facebook PT hiring payloads (shared by route + verify script). */

function asTrimmedString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v).trim();
  return String(v).trim();
}

/** Route recruiting leads only when lead_type or form_name clearly indicates hiring/recruiting. */
export function isFacebookRecruitingLeadPayload(payload: Record<string, unknown>): boolean {
  const leadType = asTrimmedString(payload.lead_type).toLowerCase();
  if (leadType.includes("pt hiring") || leadType.includes("hiring")) {
    return true;
  }

  const formName = asTrimmedString(payload.form_name).toLowerCase();
  const recruitingFormNeedles = ["hiring", "recruiting", "job", "applicant"] as const;
  if (recruitingFormNeedles.some((needle) => formName.includes(needle))) {
    return true;
  }

  return false;
}

export function normalizeFacebookRecruitingLeadFields(payload: Record<string, unknown>) {
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    norm[k.trim().toLowerCase().replace(/\s+/g, "_")] = v;
  }

  const pick = (aliases: string[]): string | null => {
    for (const alias of aliases) {
      const val = asTrimmedString(norm[alias.trim().toLowerCase().replace(/\s+/g, "_")]);
      if (val) return val;
    }
    return null;
  };

  return {
    full_name: pick(["full_name", "name"]),
    phone: pick(["phone", "phone_number", "mobile"]),
    email: pick(["email"]),
    form_name: pick(["form_name"]),
    license_status: pick(["license_status"]),
    home_health_experience: pick(["home_health_experience"]),
    visits_per_week: pick(["visits_per_week"]),
    coverage_area: pick(["coverage_area"]),
    start_date: pick(["start_date"]),
    contact_preference: pick(["contact_preference"]),
    lead_type: pick(["lead_type"]) ?? "PT Hiring",
    source: pick(["source"]) ?? "Facebook Lead Form",
    city: pick(["city"]),
  };
}
