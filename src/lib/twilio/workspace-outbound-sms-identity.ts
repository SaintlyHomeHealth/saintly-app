import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ManualInboxFromResolution } from "@/lib/twilio/manual-inbox-sms-from";
import { resolveDefaultTwilioSmsFromOrMsid } from "@/lib/twilio/sms-from-numbers";
import { loadAssignedTwilioNumberForUser } from "@/lib/twilio/twilio-phone-number-repo";
import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

export type WorkspaceOutboundSmsIdentity =
  | {
      ok: true;
      fromOverride: string | undefined;
      ownerUserId: string;
      ownerStaffProfileId: string | null;
      twilioPhoneNumberId: string | null;
      /** E.164 From when not Messaging Service SID */
      fromE164ForMessage: string | null;
    }
  | { ok: false; error: string };

/**
 * Chooses outbound SMS From for workspace/admin threaded sends:
 * 1) Explicit manual allowlisted override
 * 2) Staff-assigned Twilio number (when present)
 * 3) Org primary / Messaging Service default — only for roles with full phone visibility (managers+).
 */
export async function resolveWorkspaceThreadOutboundSmsIdentity (
  supabase: SupabaseClient,
  staff: StaffProfile,
  input: {
    manualResolved: ManualInboxFromResolution;
    /** Thread-locked From when honored by caller */
    threadPreferredE164?: string | undefined;
    honorThreadPreferred: boolean;
  }
): Promise<WorkspaceOutboundSmsIdentity> {
  if (input.manualResolved.source === "explicit") {
    return {
      ok: true,
      fromOverride: input.manualResolved.fromOverride,
      ownerUserId: staff.user_id,
      ownerStaffProfileId: staff.id,
      twilioPhoneNumberId: null,
      fromE164ForMessage: input.manualResolved.fromOverride.startsWith("MG")
        ? null
        : input.manualResolved.fromOverride,
    };
  }

  if (input.honorThreadPreferred && input.threadPreferredE164) {
    return {
      ok: true,
      fromOverride: input.threadPreferredE164,
      ownerUserId: staff.user_id,
      ownerStaffProfileId: staff.id,
      twilioPhoneNumberId: null,
      fromE164ForMessage: input.threadPreferredE164.startsWith("MG") ? null : input.threadPreferredE164,
    };
  }

  const assigned = await loadAssignedTwilioNumberForUser(supabase, staff.user_id);
  if (assigned?.phone_number && assigned.sms_enabled !== false) {
    return {
      ok: true,
      fromOverride: assigned.phone_number,
      ownerUserId: staff.user_id,
      ownerStaffProfileId: assigned.assigned_staff_profile_id ?? staff.id,
      twilioPhoneNumberId: assigned.id,
      fromE164ForMessage: assigned.phone_number,
    };
  }

  if (hasFullCallVisibility(staff)) {
    const def = resolveDefaultTwilioSmsFromOrMsid();
    return {
      ok: true,
      fromOverride: undefined,
      ownerUserId: staff.user_id,
      ownerStaffProfileId: staff.id,
      twilioPhoneNumberId: null,
      fromE164ForMessage: def.startsWith("MG") ? null : def,
    };
  }

  return {
    ok: false,
    error:
      "Your account does not have an assigned SMS line. Ask an admin to assign a Twilio number, or use a role that may send from the main company line.",
  };
}
