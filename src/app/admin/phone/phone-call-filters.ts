export type PhoneCallsAssignedFilter = "all" | "me" | "unassigned";
export type PhoneCallsStatusFilter = "all" | "missed" | "completed" | "abandoned";
export type PhoneCallsTagFilter =
  | "all"
  | "untagged"
  | "patient"
  | "referral"
  | "caregiver"
  | "family"
  | "vendor"
  | "spam"
  | "other";
export type PhoneCallsTasksFilter = "all" | "has_open_tasks" | "no_open_tasks";

export type PhoneCallsFilters = {
  assigned: PhoneCallsAssignedFilter;
  status: PhoneCallsStatusFilter;
  tag: PhoneCallsTagFilter;
  tasks: PhoneCallsTasksFilter;
};

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return v;
}

export function parsePhoneCallsSearchParams(
  raw: Record<string, string | string[] | undefined>
): PhoneCallsFilters {
  const assigned = firstString(raw.assigned);
  const status = firstString(raw.status);
  const tag = firstString(raw.tag);
  const tasks = firstString(raw.tasks);

  return {
    assigned:
      assigned === "me" || assigned === "unassigned" ? assigned : "all",
    status:
      status === "missed" || status === "completed" || status === "abandoned" ? status : "all",
    tag:
      tag === "untagged" ||
      tag === "patient" ||
      tag === "referral" ||
      tag === "caregiver" ||
      tag === "family" ||
      tag === "vendor" ||
      tag === "spam" ||
      tag === "other"
        ? tag
        : "all",
    tasks:
      tasks === "has_open_tasks" || tasks === "no_open_tasks" ? tasks : "all",
  };
}
