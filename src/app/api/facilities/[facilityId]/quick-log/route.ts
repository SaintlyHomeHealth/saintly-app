import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  isAllowedQuickLogActivityType,
  isAllowedQuickLogOutcome,
} from "@/lib/crm/facility-quick-log";
import { syncFollowUpTaskFromActivity } from "@/lib/crm/facility-follow-up-tasks";
import {
  completeCampaignStepInstance,
  linkActivityToCampaignStep,
} from "@/lib/crm/facility-campaigns";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, canAccessFacilityFieldTools } from "@/lib/staff-profile";

export type QuickLogRequestBody = {
  activity_type: string;
  outcome?: string | null;
  notes?: string | null;
  next_follow_up_at?: string | null;
  materials_dropped_off?: boolean;
  requested_packet?: boolean;
  referral_process_captured?: boolean;
  decision_maker_met?: boolean;
  referral_potential?: string | null;
  campaign_step_instance_id?: string | null;
  complete_campaign_step?: boolean;
};

export type QuickLogResponse =
  | {
      ok: true;
      activity: Record<string, unknown>;
      facility: { id: string; last_visit_at: string | null; next_follow_up_at: string | null };
      task_created?: boolean;
      task_error?: string | null;
    }
  | { ok: false; error: string };

export async function POST(
  req: Request,
  context: { params: Promise<{ facilityId: string }> }
) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessFacilityFieldTools(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" } satisfies QuickLogResponse, {
      status: 403,
    });
  }

  const user = await getAuthenticatedUser();
  const { facilityId: rawId } = await context.params;
  const facilityId = (rawId ?? "").trim();

  if (!facilityId || !/^[0-9a-f-]{36}$/i.test(facilityId)) {
    return NextResponse.json({ ok: false, error: "invalid_facility_id" } satisfies QuickLogResponse, {
      status: 400,
    });
  }

  let body: QuickLogRequestBody;
  try {
    body = (await req.json()) as QuickLogRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } satisfies QuickLogResponse, {
      status: 400,
    });
  }

  const activity_type = (body.activity_type ?? "").trim();
  if (!activity_type || !isAllowedQuickLogActivityType(activity_type)) {
    return NextResponse.json({ ok: false, error: "invalid_activity_type" } satisfies QuickLogResponse, {
      status: 400,
    });
  }

  const outcomeRaw = (body.outcome ?? "").trim();
  const outcome = outcomeRaw && isAllowedQuickLogOutcome(outcomeRaw) ? outcomeRaw : null;

  let next_follow_up_at: string | null = null;
  if (body.next_follow_up_at) {
    const d = new Date(body.next_follow_up_at);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ ok: false, error: "invalid_follow_up_date" } satisfies QuickLogResponse, {
        status: 400,
      });
    }
    next_follow_up_at = d.toISOString();
  }

  const { data: facility, error: facErr } = await supabaseAdmin
    .from("facilities")
    .select("id")
    .eq("id", facilityId)
    .maybeSingle();

  if (facErr || !facility?.id) {
    return NextResponse.json({ ok: false, error: "facility_not_found" } satisfies QuickLogResponse, {
      status: 404,
    });
  }

  const activity_at = new Date().toISOString();

  const materials_dropped_off =
    Boolean(body.materials_dropped_off) ||
    activity_type === "Packet Dropped" ||
    outcome === "Left Materials";

  const decision_maker_met =
    Boolean(body.decision_maker_met) || outcome === "Met Decision Maker";

  const { data: activity, error: actErr } = await supabaseAdmin
    .from("facility_activities")
    .insert({
      facility_id: facilityId,
      staff_user_id: user?.id ?? null,
      activity_type,
      outcome,
      activity_at,
      notes: (body.notes ?? "").trim() || null,
      next_follow_up_at,
      referral_potential: (body.referral_potential ?? "").trim() || null,
      materials_dropped_off,
      requested_packet: Boolean(body.requested_packet) || outcome === "Wants Packet Faxed",
      referral_process_captured: Boolean(body.referral_process_captured),
      decision_maker_met,
      got_business_card: false,
    })
    .select("*")
    .maybeSingle();

  if (actErr || !activity) {
    console.warn("[api/facilities/quick-log]", actErr?.message);
    return NextResponse.json({ ok: false, error: "save_failed" } satisfies QuickLogResponse, {
      status: 500,
    });
  }

  const { data: updatedFacility } = await supabaseAdmin
    .from("facilities")
    .select("id, last_visit_at, next_follow_up_at")
    .eq("id", facilityId)
    .maybeSingle();

  let task_created = false;
  let task_error: string | null = null;
  if (next_follow_up_at) {
    const sync = await syncFollowUpTaskFromActivity(supabaseAdmin, {
      facility_id: facilityId,
      activity_id: (activity as { id?: string }).id ?? null,
      outcome,
      next_follow_up_at,
      source: "quick_log",
      created_by: user?.id ?? null,
      description: (body.notes ?? "").trim() || null,
    });
    if (sync.ok) {
      task_created = Boolean(sync.task_id);
    } else {
      task_error = sync.error;
      console.warn("[api/facilities/quick-log] task sync:", sync.error);
    }
  }

  const stepInstanceId = (body.campaign_step_instance_id ?? "").trim();
  const activityId = (activity as { id?: string }).id ?? null;
  if (stepInstanceId && activityId && staff) {
    await linkActivityToCampaignStep(stepInstanceId, activityId);
    if (body.complete_campaign_step) {
      await completeCampaignStepInstance(staff, stepInstanceId, {
        activity_id: activityId,
        notes: (body.notes ?? "").trim() || null,
        complete_linked_task: false,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    activity: activity as Record<string, unknown>,
    facility: {
      id: facilityId,
      last_visit_at: (updatedFacility as { last_visit_at?: string | null } | null)?.last_visit_at ?? null,
      next_follow_up_at:
        (updatedFacility as { next_follow_up_at?: string | null } | null)?.next_follow_up_at ?? null,
    },
    task_created,
    task_error,
  } satisfies QuickLogResponse);
}
