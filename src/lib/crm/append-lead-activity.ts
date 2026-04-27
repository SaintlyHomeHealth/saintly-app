import { supabaseAdmin } from "@/lib/admin";

/**
 * Shared insert for `lead_activities` (avoids circular imports between admin action modules).
 */
export async function appendLeadActivityRow(input: {
  leadId: string;
  eventType: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdByUserId: string | null;
  deletable?: boolean;
}): Promise<boolean> {
  const { error } = await supabaseAdmin.from("lead_activities").insert({
    lead_id: input.leadId,
    event_type: input.eventType,
    body: input.body,
    metadata: input.metadata ?? {},
    created_by_user_id: input.createdByUserId,
    deletable: input.deletable ?? false,
  });
  if (error) {
    console.warn("[appendLeadActivityRow]", error.message);
    return false;
  }
  return true;
}
