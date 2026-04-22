import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { deleteTwilioRecordingBySid } from "@/lib/phone/delete-twilio-recording";

export const runtime = "nodejs";

const BATCH = 50;

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const dedicated = process.env.VOICEMAIL_CLEANUP_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (dedicated && auth === `Bearer ${dedicated}`) return true;
  if (vercelCron && auth === `Bearer ${vercelCron}`) return true;
  return false;
}

/**
 * Permanently removes soft-deleted voicemail thread messages older than 30 days, Twilio recordings,
 * and clears voicemail audio fields on `phone_calls` (call rows are retained).
 *
 * Auth: `Authorization: Bearer <VOICEMAIL_CLEANUP_CRON_SECRET>` or Vercel `CRON_SECRET`.
 */
async function handle(req: NextRequest) {
  const dedicated = process.env.VOICEMAIL_CLEANUP_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (!dedicated && !vercelCron) {
    return NextResponse.json(
      { error: "VOICEMAIL_CLEANUP_CRON_SECRET or CRON_SECRET must be configured" },
      { status: 503 }
    );
  }

  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error: selErr } = await supabaseAdmin
    .from("messages")
    .select("id, phone_call_id")
    .eq("message_type", "voicemail")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .limit(BATCH);

  if (selErr) {
    console.error("[cron/cleanup-voicemails] select:", selErr.message);
    return NextResponse.json({ ok: false, error: "select_failed" }, { status: 500 });
  }

  let processed = 0;
  let twilioDeleted = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    const messageId = typeof row.id === "string" ? row.id : "";
    const phoneCallId =
      row.phone_call_id != null && String(row.phone_call_id).trim() !== ""
        ? String(row.phone_call_id).trim()
        : "";
    if (!messageId || !phoneCallId) {
      continue;
    }

    try {
      let recordingSid: string | null = null;
      try {
        const { data: callRow } = await supabaseAdmin
          .from("phone_calls")
          .select("voicemail_recording_sid")
          .eq("id", phoneCallId)
          .maybeSingle();
        const sid =
          typeof callRow?.voicemail_recording_sid === "string"
            ? callRow.voicemail_recording_sid.trim()
            : "";
        recordingSid = sid || null;
      } catch (e) {
        errors.push(`call_load ${messageId}: ${e instanceof Error ? e.message : String(e)}`);
      }

      const { error: delErr } = await supabaseAdmin.from("messages").delete().eq("id", messageId);
      if (delErr) {
        errors.push(`message_delete ${messageId}: ${delErr.message}`);
        continue;
      }
      processed += 1;

      if (recordingSid) {
        const ok = await deleteTwilioRecordingBySid(recordingSid);
        if (ok) twilioDeleted += 1;
      }

      try {
        const { error: upCallErr } = await supabaseAdmin
          .from("phone_calls")
          .update({
            voicemail_recording_sid: null,
            voicemail_recording_url: null,
            voicemail_duration_seconds: null,
          })
          .eq("id", phoneCallId);
        if (upCallErr) {
          errors.push(`phone_calls_clear ${phoneCallId}: ${upCallErr.message}`);
        }
      } catch (e) {
        errors.push(`phone_calls_clear ${phoneCallId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      errors.push(`row ${messageId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) {
    console.warn("[cron/cleanup-voicemails] partial errors", { count: errors.length, sample: errors.slice(0, 8) });
  }

  return NextResponse.json({
    ok: true,
    scanned: rows?.length ?? 0,
    hard_deleted_messages: processed,
    twilio_recordings_removed: twilioDeleted,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
