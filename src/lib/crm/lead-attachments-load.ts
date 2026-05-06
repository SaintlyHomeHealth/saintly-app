import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";

export type LeadAttachmentWorkspaceRow = {
  id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  size_bytes: number | null;
  category: string;
  note: string | null;
  created_at: string;
  uploaded_by: string | null;
  /** Resolved from staff_profiles when present */
  uploaded_by_label: string | null;
};

export async function loadLeadAttachmentsForWorkspace(leadId: string): Promise<LeadAttachmentWorkspaceRow[]> {
  const id = leadId.trim();
  if (!id) return [];

  const { data, error } = await supabaseAdmin
    .from("lead_attachments")
    .select("id, file_name, file_path, content_type, size_bytes, category, note, created_at, uploaded_by")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingSchemaObjectError(error)) {
      return [];
    }
    console.warn("[crm] lead_attachments query failed:", error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    file_name: string;
    file_path: string;
    content_type: string | null;
    size_bytes: number | null;
    category: string;
    note: string | null;
    created_at: string;
    uploaded_by: string | null;
  }>;

  const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by).filter((x): x is string => Boolean(x?.trim())))];
  const labelByUserId = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .in("user_id", uploaderIds);
    for (const s of staffRows ?? []) {
      const name = (s.full_name ?? "").trim();
      const em = (s.email ?? "").trim();
      labelByUserId.set(s.user_id, name || em || `${s.user_id.slice(0, 8)}…`);
    }
  }

  return rows.map((r) => ({
    ...r,
    uploaded_by_label: r.uploaded_by ? labelByUserId.get(r.uploaded_by) ?? null : null,
  }));
}
