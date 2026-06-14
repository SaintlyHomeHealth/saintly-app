import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isAllowedQuickLogActivityType,
  isAllowedQuickLogOutcome,
} from "@/lib/crm/facility-quick-log";
import { similarFacilityNames } from "@/lib/crm/facility-match";

export type SaveFacilityActivityInput = {
  facility_id: string;
  staff_user_id: string | null;
  activity_type: string;
  outcome?: string | null;
  notes?: string | null;
  next_follow_up_at?: string | null;
  follow_up_task?: string | null;
  materials_dropped_off?: boolean;
  requested_packet?: boolean;
  referral_process_captured?: boolean;
  decision_maker_met?: boolean;
  referral_potential?: string | null;
  ai_summary?: string | null;
  ai_extracted_json?: Record<string, unknown> | null;
  contact_name?: string | null;
  contact_role?: string | null;
};

export async function upsertFacilityContactFromCapture(
  supabase: SupabaseClient,
  facilityId: string,
  contactName: string,
  contactRole: string | null
): Promise<string | null> {
  const name = contactName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from("facility_contacts")
    .select("id, full_name, first_name, last_name, title")
    .eq("facility_id", facilityId)
    .eq("is_active", true)
    .limit(100);

  for (const row of existing ?? []) {
    const c = row as {
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      title: string | null;
    };
    const existingName =
      (c.full_name ?? "").trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    if (existingName && similarFacilityNames(existingName, name)) {
      if (contactRole && contactRole !== (c.title ?? "")) {
        await supabase.from("facility_contacts").update({ title: contactRole }).eq("id", c.id);
      }
      return c.id;
    }
  }

  const { data: inserted, error } = await supabase
    .from("facility_contacts")
    .insert({
      facility_id: facilityId,
      full_name: name,
      title: contactRole,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !inserted?.id) {
    console.warn("[facility-activity-save] contact insert:", error?.message);
    return null;
  }
  return inserted.id as string;
}

export async function saveFacilityActivityRecord(
  supabase: SupabaseClient,
  input: SaveFacilityActivityInput
): Promise<
  | { ok: true; activity: Record<string, unknown>; contact_id: string | null }
  | { ok: false; error: string }
> {
  const activity_type = input.activity_type.trim();
  if (!activity_type || !isAllowedQuickLogActivityType(activity_type)) {
    return { ok: false, error: "invalid_activity_type" };
  }

  const outcomeRaw = (input.outcome ?? "").trim();
  const outcome = outcomeRaw && isAllowedQuickLogOutcome(outcomeRaw) ? outcomeRaw : null;

  let next_follow_up_at: string | null = null;
  if (input.next_follow_up_at) {
    const d = new Date(input.next_follow_up_at);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "invalid_follow_up_date" };
    next_follow_up_at = d.toISOString();
  }

  const { data: facility } = await supabase
    .from("facilities")
    .select("id")
    .eq("id", input.facility_id)
    .maybeSingle();

  if (!facility?.id) return { ok: false, error: "facility_not_found" };

  let contact_id: string | null = null;
  if (input.contact_name?.trim()) {
    contact_id = await upsertFacilityContactFromCapture(
      supabase,
      input.facility_id,
      input.contact_name,
      input.contact_role ?? null
    );
  }

  const materials_dropped_off =
    Boolean(input.materials_dropped_off) ||
    activity_type === "Packet Dropped" ||
    outcome === "Left Materials";

  const decision_maker_met =
    Boolean(input.decision_maker_met) || outcome === "Met Decision Maker";

  const { data: activity, error: actErr } = await supabase
    .from("facility_activities")
    .insert({
      facility_id: input.facility_id,
      facility_contact_id: contact_id,
      staff_user_id: input.staff_user_id,
      activity_type,
      outcome,
      activity_at: new Date().toISOString(),
      notes: (input.notes ?? "").trim() || null,
      next_follow_up_at,
      follow_up_task: (input.follow_up_task ?? "").trim() || null,
      referral_potential: (input.referral_potential ?? "").trim() || null,
      materials_dropped_off,
      requested_packet: Boolean(input.requested_packet) || outcome === "Wants Packet Faxed",
      referral_process_captured: Boolean(input.referral_process_captured),
      decision_maker_met,
      got_business_card: false,
      ai_summary: (input.ai_summary ?? "").trim() || null,
      ai_extracted_json: input.ai_extracted_json ?? null,
    })
    .select("*")
    .maybeSingle();

  if (actErr || !activity) {
    console.warn("[facility-activity-save]", actErr?.message);
    return { ok: false, error: "save_failed" };
  }

  return { ok: true, activity: activity as Record<string, unknown>, contact_id };
}
