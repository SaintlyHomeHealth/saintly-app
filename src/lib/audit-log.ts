import { supabaseAdmin } from "@/lib/admin";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export type AuditLogInput = {
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/**
 * Best-effort audit row using the current session (RLS: staff only, actor must match JWT).
 * Never throws; logs errors to console.
 */
export async function insertAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }

    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("email")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabase.from("audit_log").insert({
      actor_user_id: user.id,
      actor_email: profile?.email ?? user.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("[insertAuditLog]", error);
    }
  } catch (e) {
    console.error("[insertAuditLog]", e);
  }
}

/**
 * Append-only audit row using the service role after verifying the current session user.
 * Use for actions where RLS would block `insertAuditLog` (e.g. nurse workspace) or when
 * you need a guaranteed insert from server code.
 */
export async function insertAuditLogTrusted(input: AuditLogInput): Promise<void> {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return;
    }

    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("email")
      .eq("user_id", user.id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("audit_log").insert({
      actor_user_id: user.id,
      actor_email: profile?.email ?? user.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("[insertAuditLogTrusted]", error);
    }
  } catch (e) {
    console.error("[insertAuditLogTrusted]", e);
  }
}
