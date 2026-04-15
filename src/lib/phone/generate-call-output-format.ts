import type { GenerateCallOutputType } from "@/lib/phone/generate-call-output-prompts";

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asLines(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function jsonObjectToDisplayText(type: GenerateCallOutputType, raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "";
  }
  const o = raw as Record<string, unknown>;

  if (type === "soap") {
    const gaps = asStr(o.information_not_evident_in_transcript);
    const s = [
      "## Subjective",
      asStr(o.subjective) || "—",
      "",
      "## Objective",
      asStr(o.objective) || "—",
      "",
      "## Assessment",
      asStr(o.assessment) || "—",
      "",
      "## Plan",
      asStr(o.plan) || "—",
      "",
      "## Information not evident in transcript",
      gaps || "—",
    ];
    return s.join("\n").trim();
  }

  if (type === "summary") {
    const points = asLines(o.key_discussion_points);
    const confirmed = asStr(o.confirmed_facts);
    const gaps = asStr(o.not_stated_or_unclear);
    const lines = [
      "## Reason for call",
      asStr(o.reason_for_call) || "—",
      "",
      "## Who called",
      asStr(o.who_called) || "—",
      "",
      "## Confirmed facts (from transcript)",
      confirmed || "—",
      "",
      "## Key discussion points",
      points || "—",
      "",
      "## Decisions made",
      asStr(o.decisions_made) || "—",
      "",
      "## Follow-up actions",
      asStr(o.follow_up_actions) || "—",
      "",
      "## Urgency level",
      asStr(o.urgency_level) || "—",
      "",
      "## Not stated or unclear",
      gaps || "—",
    ];
    return lines.join("\n").trim();
  }

  const confirmed = asStr(o.confirmed_facts_from_call);
  const missing = asStr(o.missing_information);
  const unclear = asStr(o.not_stated_or_unclear);
  const lines = [
    "## Confirmed facts (from transcript)",
    confirmed || "—",
    "",
    "## Patient / caller identity",
    asStr(o.patient_name) || "—",
    "",
    "## Caller relationship",
    asStr(o.caller_relationship) || "—",
    "",
    "## Diagnosis / condition",
    asStr(o.diagnosis_or_condition) || "—",
    "",
    "## Services needed",
    asStr(o.services_needed) || "—",
    "",
    "## Insurance / payer",
    asStr(o.insurance_or_payer) || "—",
    "",
    "## Address / location",
    asStr(o.address_or_location) || "—",
    "",
    "## Urgency",
    asStr(o.urgency) || "—",
    "",
    "## Missing information",
    missing || "—",
    "",
    "## Not stated or unclear (additional)",
    unclear || "—",
    "",
    "## Recommended next step",
    asStr(o.recommended_next_step) || "—",
  ];
  return lines.join("\n").trim();
}
