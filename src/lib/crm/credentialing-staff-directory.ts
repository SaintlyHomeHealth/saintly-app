import { supabaseAdmin } from "@/lib/admin";

export type CredentialingStaffOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

export async function loadCredentialingStaffAssignees(): Promise<CredentialingStaffOption[]> {
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .in("role", ["manager", "admin", "super_admin"])
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    console.warn("[credentialing] staff list:", error.message);
    return [];
  }
  return (data ?? []) as CredentialingStaffOption[];
}

export function credentialingStaffLabel(s: CredentialingStaffOption): string {
  const n = (s.full_name ?? "").trim();
  if (n) return n;
  const e = (s.email ?? "").trim();
  if (e) return e;
  return `${s.user_id.slice(0, 8)}…`;
}

export async function loadCredentialingStaffLabelMap(userIds: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (uniq.length === 0) return map;

  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .in("user_id", uniq);

  if (error) {
    console.warn("[credentialing] staff map:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const s = row as CredentialingStaffOption;
    map.set(s.user_id, credentialingStaffLabel(s));
  }
  for (const id of uniq) {
    if (!map.has(id)) map.set(id, `${id.slice(0, 8)}…`);
  }
  return map;
}
