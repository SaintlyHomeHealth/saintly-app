/** Reference kinds stored in internal chat as `@[label](kind:uuid)` (server + client). */
export const INTERNAL_CHAT_REF_KINDS = ["patient", "lead", "facility", "employee", "recruit"] as const;
export type InternalChatRefKind = (typeof INTERNAL_CHAT_REF_KINDS)[number];

const REF_PREFIX: Record<InternalChatRefKind, string> = {
  patient: "Patient",
  lead: "Lead",
  facility: "Facility",
  employee: "Employee",
  recruit: "Recruit",
};

export function refKindDisplayLabel(kind: InternalChatRefKind): string {
  return REF_PREFIX[kind];
}

/** Text inserted in composer and replaced server-side, e.g. `@Patient: Jane Doe` */
export function refComposerToken(kind: InternalChatRefKind, label: string): string {
  return `@${REF_PREFIX[kind]}: ${label.trim()}`;
}
