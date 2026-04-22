import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { deleteTwilioRecordingBySid } from "@/lib/phone/delete-twilio-recording";

export const runtime = "nodejs";

const BATCH = 50;
/** Fetch extra phone_calls rows; narrow in-app (JSON timestamp + no voicemail message row). */
const METADATA_CANDIDATE_CAP = BATCH * 5;

function parseMetadataSoftDeletedMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).voicemail_inbox_soft_deleted_at;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? t : null;
}

/**
 * Legacy list deletes: `phone_calls.metadata.voicemail_inbox_soft_deleted_at` with no `messages` voicemail row.
 * Separate from message-row cleanup to avoid double-processing rows that still have a thread message.
 */
async function cleanupMetadataOnlySoftDeletedVoicemails(cutoffIso: string, cutoffMs: number): Promise<{
  candidatesScanned: number;
  cleaned: number;
  twilioRemoved: number;
}> {
  const { data: candidates, error: selErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, voicemail_recording_sid, voicemail_recording_url, voicemail_duration_seconds, metadata")
    .filter("metadata->>voicemail_inbox_soft_deleted_at", "lt", cutoffIso)
    .limit(METADATA_CANDIDATE_CAP);

  if (selErr) {
    console.error("[cron/cleanup-voicemails] metadata-only select:", selErr.message);
    return { candidatesScanned: 0, cleaned: 0, twilioRemoved: 0 };
  }

  const rows = candidates ?? [];
  const eligible = rows.filter((r) => {
    const at = parseMetadataSoftDeletedMs(r.metadata);
    return at != null && at < cutoffMs;
  });

  if (eligible.length === 0) {
    return { candidatesScanned: rows.length, cleaned: 0, twilioRemoved: 0 };
  }

  const eligibleIds = eligible.map((r) => String(r.id)).filter(Boolean);
  const { data: vmMsgs, error: vmErr } = await supabaseAdmin
    .from("messages")
    .select("phone_call_id")
    .eq("message_type", "voicemail")
    .in("phone_call_id", eligibleIds);

  if (vmErr) {
    console.error("[cron/cleanup-voicemails] metadata-only vm message check:", vmErr.message);
    return { candidatesScanned: rows.length, cleaned: 0, twilioRemoved: 0 };
  }

  const hasVoicemailMessage = new Set(
    (vmMsgs ?? [])
      .map((m) => (typeof m.phone_call_id === "string" ? m.phone_call_id.trim() : ""))
      .filter(Boolean)
  );

  const toProcess = eligible.filter((r) => !hasVoicemailMessage.has(String(r.id))).slice(0, BATCH);

  let cleaned = 0;
  let twilioRemoved = 0;
  const errors: string[] = [];

  for (const row of toProcess) {
    const phoneCallId = String(row.id);
    try {
      const sidRaw = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
      const recordingSid = sidRaw || null;

      if (recordingSid) {
        const ok = await deleteTwilioRecordingBySid(recordingSid);
        if (ok) twilioRemoved += 1;
      }

      const prev =
        row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? { ...(row.metadata as Record<string, unknown>) }
          : {};
      delete prev.voicemail_inbox_soft_deleted_at;

      const { error: upErr } = await supabaseAdmin
        .from("phone_calls")
        .update({
          voicemail_recording_sid: null,
          voicemail_recording_url: null,
          voicemail_duration_seconds: null,
          metadata: prev,
        })
        .eq("id", phoneCallId);

      if (upErr) {
        errors.push(`metadata_cleanup ${phoneCallId}: ${upErr.message}`);
        continue;
      }
      cleaned += 1;
    } catch (e) {
      errors.push(`metadata_cleanup ${phoneCallId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length > 0) {
    console.warn("[cron/cleanup-voicemails] metadata-only partial errors", {
      count: errors.length,
      sample: errors.slice(0, 8),
    });
  }

  return { candidatesScanned: rows.length, cleaned, twilioRemoved };
}

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const dedicated = process.env.VOICEMAIL_CLEANUP_CRON_SECRET?.trim();
  const vercelCron = process.env.CRON_SECRET?.trim();
  if (dedicated && auth === `Bearer ${dedicated}`) return true;
  if (vercelCron && auth === `Bearer ${vercelCron}`) return true;
  return false;
}

/**
 * (1) Permanently removes soft-deleted voicemail **messages** older than 30 days (+ Twilio + clear audio on call).
 * (2) Permanently cleans **metadata-only** list deletes: `phone_calls.metadata.voicemail_inbox_soft_deleted_at`
 *     older than 30 days when there is **no** `messages` row with `message_type = 'voicemail'`.
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

  const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString();

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

  const metaPhase = await cleanupMetadataOnlySoftDeletedVoicemails(cutoff, cutoffMs);

  return NextResponse.json({
    ok: true,
    scanned: rows?.length ?? 0,
    hard_deleted_messages: processed,
    twilio_recordings_removed: twilioDeleted,
    metadata_only_candidates_scanned: metaPhase.candidatesScanned,
    metadata_only_cleaned: metaPhase.cleaned,
    metadata_only_twilio_recordings_removed: metaPhase.twilioRemoved,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
