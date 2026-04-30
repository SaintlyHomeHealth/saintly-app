import { supabaseAdmin } from "@/lib/admin";

export type AssignableLeadOwnerRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

/** Roles that cannot be assigned CRM lead ownership (`read_only` has no CRM write UX). */
const EXCLUDED_FROM_LEAD_OWNER_DROPDOWN = new Set<string>(["read_only"]);

export function assignableLeadOwnerSortKey(row: AssignableLeadOwnerRow): string {
  const name = (row.full_name ?? "").trim();
  if (name) return name.toLowerCase();
  const em = (row.email ?? "").trim();
  if (em) return em.toLowerCase();
  return row.user_id.toLowerCase();
}

/**
 * Assignable CRM lead owners (`leads.owner_user_id` ↔ `staff_profiles.user_id`).
 * Bypasses `staff_profiles` RLS via service role — call only after the viewer passes admin CRM auth.
 *
 * Includes active profiles with linked auth users only. Preserves legacy owners who are inactive or
 * no longer eligible by merging `preserveUserIds` lookups from the admin client.
 */
export async function loadAssignableLeadOwners(opts?: {
  preserveUserIds?: string[];
}): Promise<AssignableLeadOwnerRow[]> {
  const preserve = [...new Set((opts?.preserveUserIds ?? []).map((id) => id.trim()).filter(Boolean))];

  const { data: rows, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role, full_name")
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) {
    console.warn("[crm] assignable lead owners:", error.message);
    return [];
  }

  const byId = new Map<string, AssignableLeadOwnerRow>();

  for (const r of rows ?? []) {
    const uid =
      typeof (r as { user_id?: unknown }).user_id === "string"
        ? String((r as { user_id: string }).user_id).trim()
        : "";
    if (!uid) continue;
    const role = typeof (r as { role?: unknown }).role === "string" ? String((r as { role: string }).role).trim() : "";
    if (role && EXCLUDED_FROM_LEAD_OWNER_DROPDOWN.has(role)) continue;
    const emailRaw = typeof (r as { email?: unknown }).email === "string" ? String((r as { email?: string }).email) : null;
    const fullNameRaw =
      typeof (r as { full_name?: unknown }).full_name === "string"
        ? String((r as { full_name?: string }).full_name)
        : null;
    byId.set(uid, { user_id: uid, email: emailRaw ?? null, full_name: fullNameRaw ?? null });
  }

  const missingPreserve = preserve.filter((pid) => !byId.has(pid));
  if (missingPreserve.length > 0) {
    const { data: extraRows, error: preserveErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, role, full_name")
      .in("user_id", missingPreserve);

    if (preserveErr) {
      console.warn("[crm] assignable lead owners (preserve lookup):", preserveErr.message);
    } else {
      for (const lone of extraRows ?? []) {
        const uid =
          typeof (lone as { user_id?: unknown }).user_id === "string"
            ? String((lone as { user_id: string }).user_id).trim()
            : "";
        if (!uid) continue;

        const emailRaw =
          typeof (lone as { email?: unknown }).email === "string"
            ? String((lone as { email?: string }).email)
            : null;
        const fullNameRaw =
          typeof (lone as { full_name?: unknown }).full_name === "string"
            ? String((lone as { full_name?: string }).full_name)
            : null;

        byId.set(uid, {
          user_id: uid,
          email: emailRaw ?? null,
          full_name: fullNameRaw ?? null,
        });
      }
    }
  }

  const list = [...byId.values()];
  list.sort((a, b) =>
    assignableLeadOwnerSortKey(a).localeCompare(assignableLeadOwnerSortKey(b), "en-US", {
      sensitivity: "base",
    })
  );

  return list;
}
