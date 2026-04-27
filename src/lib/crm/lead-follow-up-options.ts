/**
 * Stored in `leads.next_action` (text). Labels are for UI only.
 * DB: `leads_next_action_check` must list the same `value`s (see migrations).
 */
export const LEAD_NEXT_ACTION_OPTIONS = [
  { value: "call_again", label: "Call again" },
  { value: "text_follow_up", label: "Text follow-up" },
  { value: "schedule_soc", label: "Schedule SOC" },
  { value: "verify_insurance", label: "Verify insurance" },
  { value: "get_doctor_info", label: "Get doctor info" },
  { value: "convert_to_patient", label: "Move to Patient stage" },
  { value: "no_further_action", label: "No further action" },
  { value: "call_patient", label: "Call patient" },
  { value: "call_referral", label: "Call referral" },
  { value: "waiting_docs", label: "Waiting on docs" },
  { value: "other", label: "Other" },
] as const;

export type LeadNextActionValue = (typeof LEAD_NEXT_ACTION_OPTIONS)[number]["value"];

const SET = new Set<string>(LEAD_NEXT_ACTION_OPTIONS.map((o) => o.value));

/** Exact allowed DB values (single source of truth with LEAD_NEXT_ACTION_OPTIONS). */
export const ALLOWED_LEAD_NEXT_ACTION_VALUES: readonly string[] = LEAD_NEXT_ACTION_OPTIONS.map((o) => o.value);

const LABEL_TO_VALUE = (() => {
  const m = new Map<string, string>();
  for (const o of LEAD_NEXT_ACTION_OPTIONS) {
    m.set(o.label, o.value);
    m.set(o.label.toLowerCase(), o.value);
  }
  return m;
})();

export function isValidLeadNextAction(v: string): v is LeadNextActionValue {
  return SET.has(v);
}

/**
 * Map form/API input (enum value, label, or common variants) to a DB-safe value.
 * Use before any insert/update of `leads.next_action`.
 */
export function normalizeLeadNextActionInput(
  raw: string | null | undefined
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (raw == null) return { ok: true, value: null };
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return { ok: true, value: null };

  if (SET.has(t)) return { ok: true, value: t };

  const fromLabel = LABEL_TO_VALUE.get(t) ?? LABEL_TO_VALUE.get(t.toLowerCase());
  if (fromLabel) return { ok: true, value: fromLabel };

  const snake = t
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (SET.has(snake)) return { ok: true, value: snake };

  return {
    ok: false,
    message: `Next step must be one of: ${LEAD_NEXT_ACTION_OPTIONS.map((o) => o.label).join(", ")}.`,
  };
}

const LABEL_BY_VALUE = Object.fromEntries(LEAD_NEXT_ACTION_OPTIONS.map((o) => [o.value, o.label])) as Record<
  LeadNextActionValue,
  string
>;

export function formatLeadNextActionLabel(v: string | null | undefined): string {
  if (!v || typeof v !== "string") return "—";
  const t = v.trim();
  return LABEL_BY_VALUE[t as LeadNextActionValue] ?? t.replace(/_/g, " ");
}
