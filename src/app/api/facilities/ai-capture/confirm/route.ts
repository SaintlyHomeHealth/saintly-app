import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { saveFacilityActivityRecord } from "@/lib/crm/facility-activity-save";
import { syncFollowUpTaskFromActivity } from "@/lib/crm/facility-follow-up-tasks";
import {
  completeCampaignStepInstance,
  linkActivityToCampaignStep,
} from "@/lib/crm/facility-campaigns";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type AiCaptureConfirmBody = {
  facility_id: string;
  activity_type: string;
  outcome?: string | null;
  notes?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  follow_up_task?: string | null;
  next_follow_up_at?: string | null;
  materials_dropped_off?: boolean;
  requested_packet?: boolean;
  referral_process_captured?: boolean;
  decision_maker_met?: boolean;
  referral_potential?: string | null;
  ai_summary?: string | null;
  ai_extracted_json?: Record<string, unknown> | null;
  campaign_step_instance_id?: string | null;
  complete_campaign_step?: boolean;
};

export type AiCaptureConfirmResponse =
  | {
      ok: true;
      activity: Record<string, unknown>;
      facility: { id: string; last_visit_at: string | null; next_follow_up_at: string | null };
      contact_id: string | null;
      task_created?: boolean;
      task_error?: string | null;
    }
  | { ok: false; error: string };

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies AiCaptureConfirmResponse, {
      status: 403,
    });
  }

  const user = await getAuthenticatedUser();

  let body: AiCaptureConfirmBody;
  try {
    body = (await req.json()) as AiCaptureConfirmBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies AiCaptureConfirmResponse, {
      status: 400,
    });
  }

  const facility_id = (body.facility_id ?? "").trim();
  if (!facility_id || !/^[0-9a-f-]{36}$/i.test(facility_id)) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies AiCaptureConfirmResponse, {
      status: 400,
    });
  }

  const saved = await saveFacilityActivityRecord(supabaseAdmin, {
    facility_id,
    staff_user_id: user?.id ?? null,
    activity_type: body.activity_type,
    outcome: body.outcome,
    notes: body.notes,
    next_follow_up_at: body.next_follow_up_at,
    follow_up_task: body.follow_up_task,
    materials_dropped_off: body.materials_dropped_off,
    requested_packet: body.requested_packet,
    referral_process_captured: body.referral_process_captured,
    decision_maker_met: body.decision_maker_met,
    referral_potential: body.referral_potential,
    ai_summary: body.ai_summary,
    ai_extracted_json: body.ai_extracted_json ?? null,
    contact_name: body.contact_name,
    contact_role: body.contact_role,
  });

  if (!saved.ok) {
    const status = saved.error === "facility_not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: saved.error } satisfies AiCaptureConfirmResponse, {
      status,
    });
  }

  const { data: updatedFacility } = await supabaseAdmin
    .from("facilities")
    .select("id, last_visit_at, next_follow_up_at")
    .eq("id", facility_id)
    .maybeSingle();

  let task_created = false;
  let task_error: string | null = null;
  const followUpAt = (saved.activity as { next_follow_up_at?: string | null }).next_follow_up_at;
  if (followUpAt) {
    const sync = await syncFollowUpTaskFromActivity(supabaseAdmin, {
      facility_id,
      activity_id: (saved.activity as { id?: string }).id ?? null,
      contact_id: saved.contact_id,
      follow_up_task: body.follow_up_task,
      outcome: body.outcome,
      next_follow_up_at: followUpAt,
      source: "ai_capture",
      created_by: user?.id ?? null,
      description: (body.notes ?? "").trim() || null,
    });
    if (sync.ok) {
      task_created = Boolean(sync.task_id);
    } else {
      task_error = sync.error;
      console.warn("[ai-capture/confirm] task sync:", sync.error);
    }
  }

  const stepInstanceId = (body.campaign_step_instance_id ?? "").trim();
  const activityId = (saved.activity as { id?: string }).id ?? null;
  if (stepInstanceId && activityId && staff) {
    await linkActivityToCampaignStep(stepInstanceId, activityId);
    const shouldComplete =
      body.complete_campaign_step ||
      Boolean(body.referral_process_captured && body.ai_extracted_json?.campaign_step_completed);
    if (shouldComplete) {
      await completeCampaignStepInstance(staff, stepInstanceId, {
        activity_id: activityId,
        notes: (body.notes ?? "").trim() || null,
        complete_linked_task: false,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    activity: saved.activity,
    contact_id: saved.contact_id,
    facility: {
      id: facility_id,
      last_visit_at: (updatedFacility as { last_visit_at?: string | null } | null)?.last_visit_at ?? null,
      next_follow_up_at:
        (updatedFacility as { next_follow_up_at?: string | null } | null)?.next_follow_up_at ?? null,
    },
    task_created,
    task_error,
  } satisfies AiCaptureConfirmResponse);
}
