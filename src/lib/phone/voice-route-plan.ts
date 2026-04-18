/**
 * Deterministic inbound PSTN routing: business hours, ring groups, PSTN fallbacks.
 */

import {
  DEFAULT_BUSINESS_HOURS_SCHEDULE,
  resolveBusinessHoursContext,
  resolveBusinessHoursScheduleFromEnv,
  type BusinessHoursContext,
} from "@/lib/phone/business-hours";
import {
  filterUserIdsWithActiveVoiceDevices,
  resolveMergedRingGroupsOrdered,
  resolveRingGroupUserIds,
} from "@/lib/phone/ring-groups";
import {
  readAfterHoursPstnE164FromEnv,
  readEscalationPstnFallbackE164FromEnv,
} from "@/lib/phone/voice-escalation-config";
import {
  resolveBackupInboundStaffUserIdsAsync,
  resolveInboundBrowserStaffUserIdsAsync,
} from "@/lib/softphone/inbound-staff-ids";
import { logInboundVoiceDebug, uuidTail } from "@/lib/phone/twilio-voice-debug";
import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type InboundRouteType =
  | "business_hours_open"
  | "after_hours"
  | "weekend_or_holiday";

export type VoicemailVariant = "business_hours" | "after_hours";

export type VoiceInboundRoutePlan = {
  routeType: InboundRouteType;
  afterHours: boolean;
  /** Human-readable primary queue label for reporting. */
  primaryRingGroupLabel: string;
  businessHours: BusinessHoursContext;
  voicemailVariant: VoicemailVariant;
  /** Browser ring targets (may be empty → skip to PSTN / voicemail). */
  primaryUserIds: string[];
  backupUserIds: string[];
  /** Office line (often front desk). */
  officePstnE164: string | null;
  /** On-call / director cell after office line. */
  escalationPstnE164: string | null;
  /** Dedicated after-hours PSTN (optional). */
  afterHoursPstnE164: string | null;
};

function readOfficePstnFromEnv(): string {
  const raw = process.env.TWILIO_VOICE_RING_E164?.trim() ?? "";
  if (!raw) return "";
  return raw.split(/[,;]/)[0]?.trim()?.replace(/^["']|["']$/g, "") ?? "";
}

function normalizePstn(raw: string | undefined): string | null {
  const t = raw?.trim() ?? "";
  if (!t) return null;
  const first = t.split(/[,;]/)[0]?.trim()?.replace(/^["']|["']$/g, "") ?? "";
  if (!first) return null;
  return normalizeDialInputToE164(first);
}

function dedupePstnChain(nums: Array<string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of nums) {
    if (!n) continue;
    const k = n.replace(/\D/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * Builds the routing plan for the current instant (and optional ring-group overrides).
 */
export async function buildVoiceInboundRoutePlan(now: Date = new Date()): Promise<VoiceInboundRoutePlan> {
  const scheduleFromEnv = resolveBusinessHoursScheduleFromEnv();
  const businessHours: BusinessHoursContext =
    scheduleFromEnv == null
      ? resolveBusinessHoursContext(now, DEFAULT_BUSINESS_HOURS_SCHEDULE)
      : resolveBusinessHoursContext(now, scheduleFromEnv);
  const afterHours = businessHours.useAfterHoursRouting;
  const isWeekendOrHoliday = businessHours.isWeekendDay || businessHours.isHoliday;

  let routeType: InboundRouteType = "business_hours_open";
  if (afterHours) {
    routeType = isWeekendOrHoliday ? "weekend_or_holiday" : "after_hours";
  }

  const officeRaw = readOfficePstnFromEnv();
  const escalationRaw = readEscalationPstnFallbackE164FromEnv();
  const afterHoursRaw = readAfterHoursPstnE164FromEnv();

  const officePstn = normalizePstn(officeRaw);
  const escalationPstn = normalizePstn(escalationRaw);
  const afterHoursPstn = normalizePstn(afterHoursRaw);

  /** Legacy env + DB staff lists (preserve existing deployments). */
  const legacyPrimary = await resolveInboundBrowserStaffUserIdsAsync();
  const legacyBackup = await resolveBackupInboundStaffUserIdsAsync();

  let primaryLabel = "legacy_env";
  let primaryUserIds: string[] = [];
  let backupUserIds: string[] = [];

  if (!afterHours) {
    const intakeAdmin = await resolveMergedRingGroupsOrdered(["intake", "admin"]);
    primaryUserIds = [...legacyPrimary, ...intakeAdmin];
    const billing = await resolveRingGroupUserIds("billing");
    backupUserIds = [...legacyBackup, ...billing];
    primaryLabel = "intake_admin+billing_backup";
  } else {
    const onCall = await resolveRingGroupUserIds("on_call");
    primaryUserIds = [...onCall];
    backupUserIds = [];
    primaryLabel = "on_call";
  }

  /** De-dupe while keeping order. */
  const dedupe = (ids: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      const k = id.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(id);
      }
    }
    return out;
  };
  primaryUserIds = dedupe(primaryUserIds);
  backupUserIds = dedupe(backupUserIds.filter((id) => !primaryUserIds.includes(id)));

  primaryUserIds = await filterUserIdsWithActiveVoiceDevices(primaryUserIds);
  backupUserIds = await filterUserIdsWithActiveVoiceDevices(backupUserIds);

  logInboundVoiceDebug("business_route_plan", {
    route_type: routeType,
    after_hours: afterHours,
    primary_ring_group_label: primaryLabel,
    primary_user_id_tails: primaryUserIds.map((id) => uuidTail(id)),
    backup_user_id_tails: backupUserIds.map((id) => uuidTail(id)),
    primary_count: primaryUserIds.length,
    backup_count: backupUserIds.length,
    note: "Twilio identities are saintly_<uuid>; mobile VoIP requires matching Voice.register(token) and devices.is_active.",
  });

  const voicemailVariant: VoicemailVariant = afterHours ? "after_hours" : "business_hours";

  return {
    routeType,
    afterHours,
    primaryRingGroupLabel: primaryLabel,
    businessHours,
    voicemailVariant,
    primaryUserIds,
    backupUserIds,
    officePstnE164: officePstn,
    escalationPstnE164: escalationPstn,
    afterHoursPstnE164: afterHoursPstn,
  };
}

export type CascadeStep =
  | { kind: "browser"; userIds: string[]; label: string }
  | { kind: "pstn"; e164: string; label: string }
  | { kind: "voicemail" };

const VOICE_ROUTING_JSON_VERSION = 1 as const;

export type InboundCallerDisplayJson = {
  caller_name: string | null;
  caller_name_source: "internal" | "lookup" | "number_only";
  /** Same source as `caller_name` today; used for TwiML `caller_name` fallback ordering. */
  display_name?: string | null;
  /** NANP-style line; TwiML label fallback when no resolved name. */
  formatted_number?: string | null;
  /** E.164 for last-resort formatted CLI label (never sent as raw id). */
  e164?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  conversation_id?: string | null;
  subtitle?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
};

export type VoiceRoutingJsonV1 = {
  v: typeof VOICE_ROUTING_JSON_VERSION;
  route_type: string;
  after_hours: boolean;
  primary_ring_group_label: string | null;
  voicemail_variant: VoicemailVariant;
  steps: CascadeStep[];
  active_step_index: number;
  /** Set on first `/inbound-ring` for cascade steps + mobile CallKit custom parameters. */
  inbound_caller_display?: InboundCallerDisplayJson | null;
};

export function buildCascadeStepsFromPlan(plan: VoiceInboundRoutePlan): CascadeStep[] {
  const steps: CascadeStep[] = [];

  if (plan.primaryUserIds.length > 0) {
    steps.push({ kind: "browser", userIds: plan.primaryUserIds, label: "primary" });
  }
  if (plan.backupUserIds.length > 0) {
    steps.push({ kind: "browser", userIds: plan.backupUserIds, label: "backup" });
  }

  const pstnChain: string[] = plan.afterHours
    ? dedupePstnChain([plan.afterHoursPstnE164, plan.escalationPstnE164, plan.officePstnE164])
    : dedupePstnChain([plan.officePstnE164, plan.escalationPstnE164, plan.afterHoursPstnE164]);

  for (let i = 0; i < pstnChain.length; i++) {
    const e164 = pstnChain[i];
    steps.push({
      kind: "pstn",
      e164,
      label: i === 0 && plan.afterHours ? "after_hours_pstn" : i === 0 ? "office_pstn" : `pstn_${i + 1}`,
    });
  }

  steps.push({ kind: "voicemail" });

  return steps;
}

export function initialRoutingJsonFromSteps(
  plan: VoiceInboundRoutePlan,
  steps: CascadeStep[]
): VoiceRoutingJsonV1 {
  return {
    v: VOICE_ROUTING_JSON_VERSION,
    route_type: plan.routeType,
    after_hours: plan.afterHours,
    primary_ring_group_label: plan.primaryRingGroupLabel,
    voicemail_variant: plan.voicemailVariant,
    steps,
    active_step_index: 0,
  };
}
