import "server-only";

import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import {
  isSaintlyBackupSmsE164,
  isSaintlyPrimarySmsE164,
} from "@/lib/twilio/sms-from-numbers";

export type SyncTwilioIncomingNumbersResult =
  | { ok: true; scanned: number; inserted: number; updated: number }
  | { ok: false; error: string };

function classifySyncedRow(e164: string): {
  number_type: string;
  is_primary_company_number: boolean;
  is_company_backup_number: boolean;
} {
  if (isSaintlyPrimarySmsE164(e164)) {
    return {
      number_type: "company_shared",
      is_primary_company_number: true,
      is_company_backup_number: false,
    };
  }
  if (isSaintlyBackupSmsE164(e164)) {
    return {
      number_type: "company_shared",
      is_primary_company_number: false,
      is_company_backup_number: true,
    };
  }
  return {
    number_type: "staff_direct",
    is_primary_company_number: false,
    is_company_backup_number: false,
  };
}

async function clearExclusiveFlagsExceptRow(excludeId: string, flags: ("primary" | "backup")[]): Promise<void> {
  if (flags.includes("primary")) {
    await supabaseAdmin
      .from("twilio_phone_numbers")
      .update({ is_primary_company_number: false })
      .neq("id", excludeId)
      .eq("is_primary_company_number", true);
  }
  if (flags.includes("backup")) {
    await supabaseAdmin
      .from("twilio_phone_numbers")
      .update({ is_company_backup_number: false })
      .neq("id", excludeId)
      .eq("is_company_backup_number", true);
  }
}

/**
 * Lists IncomingPhoneNumbers from Twilio REST and inserts/updates `twilio_phone_numbers`.
 * Saintly main (+14803600008) and backup (+14805712062) are typed `company_shared` with role flags.
 * Does not purchase numbers; safe to run repeatedly.
 */
export async function syncTwilioIncomingPhoneNumbersIntoDb(): Promise<SyncTwilioIncomingNumbersResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN." };
  }

  const client = twilio(accountSid, authToken);
  let scanned = 0;
  let inserted = 0;
  let updated = 0;

  const nums = await client.incomingPhoneNumbers.list({ pageSize: 1000 });

  for (const n of nums) {
    scanned += 1;
    const sid = typeof n.sid === "string" ? n.sid.trim() : "";
    const rawPn = typeof n.phoneNumber === "string" ? n.phoneNumber.trim() : "";
    const e164 = normalizeDialInputToE164(rawPn);
    if (!sid || !e164 || !isValidE164(e164)) continue;

    const friendly =
      typeof n.friendlyName === "string" && n.friendlyName.trim()
        ? n.friendlyName.trim().slice(0, 200)
        : null;

    const classified = classifySyncedRow(e164);

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("twilio_phone_numbers")
      .select("id, status, assigned_user_id, phone_number")
      .eq("twilio_sid", sid)
      .maybeSingle();

    if (selErr) {
      console.warn("[twilio-sync] select by sid:", selErr.message);
      continue;
    }

    const assigned =
      existing?.status === "assigned" &&
      existing?.assigned_user_id != null &&
      String(existing.assigned_user_id).trim() !== "";

    if (!existing?.id) {
      if (classified.is_primary_company_number) {
        await supabaseAdmin
          .from("twilio_phone_numbers")
          .update({ is_primary_company_number: false })
          .eq("is_primary_company_number", true);
      }
      if (classified.is_company_backup_number) {
        await supabaseAdmin
          .from("twilio_phone_numbers")
          .update({ is_company_backup_number: false })
          .eq("is_company_backup_number", true);
      }

      const { data: insRow, error: insErr } = await supabaseAdmin
        .from("twilio_phone_numbers")
        .insert({
          phone_number: e164,
          twilio_sid: sid,
          label: friendly,
          number_type: classified.number_type,
          is_primary_company_number: classified.is_primary_company_number,
          is_company_backup_number: classified.is_company_backup_number,
          status: "available",
          sms_enabled: true,
          voice_enabled: true,
        })
        .select("id")
        .maybeSingle();

      if (insErr || !insRow?.id) {
        console.warn("[twilio-sync] insert:", insErr?.message ?? "no id", { sid, e164 });
        continue;
      }
      inserted += 1;
      await supabaseAdmin.from("twilio_phone_number_assignments").insert({
        phone_number_id: insRow.id,
        assigned_from_user_id: null,
        assigned_to_user_id: null,
        assigned_by_user_id: null,
        reason: "twilio_sync_import",
      });
      continue;
    }

    const patch: Record<string, unknown> = {
      phone_number: e164,
      updated_at: new Date().toISOString(),
    };
    if (friendly != null) patch.label = friendly;

    if (!assigned) {
      if (classified.is_primary_company_number) {
        await clearExclusiveFlagsExceptRow(existing.id, ["primary"]);
      }
      if (classified.is_company_backup_number) {
        await clearExclusiveFlagsExceptRow(existing.id, ["backup"]);
      }
      patch.number_type = classified.number_type;
      patch.is_primary_company_number = classified.is_primary_company_number;
      patch.is_company_backup_number = classified.is_company_backup_number;
    }

    const { error: upErr } = await supabaseAdmin.from("twilio_phone_numbers").update(patch).eq("id", existing.id);
    if (!upErr) {
      updated += 1;
    } else {
      console.warn("[twilio-sync] update:", upErr.message, { id: existing.id });
    }
  }

  return { ok: true, scanned, inserted, updated };
}
