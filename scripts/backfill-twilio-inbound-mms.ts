/**
 * Operational backfill: download Twilio MMS for recent inbound SMS rows that have MessageSid +
 * empty body and no attachments yet (older webhook behavior).
 *
 * Usage:
 *   npx tsx scripts/backfill-twilio-inbound-mms.ts [--days=14] [--limit=250] [--verbose]
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { absoluteTwilioMediaDownloadUrlsFromListPayload } from "../src/lib/phone/twilio-media-fetch";

const BUCKET = "phone-message-media";
const DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function parseArg(name: string, def: number): number {
  const raw = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!raw) return def;
  const n = Number.parseInt(raw.slice(name.length + 1), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function parseFlag(name: string): boolean {
  return process.argv.includes(name) || process.argv.some((a) => a.startsWith(`${name}=`));
}

function sanitizeFileName(base: string): string {
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "file";
}

async function listTwilioMessageMediaUrls(
  messageSid: string
): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing" };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages/${encodeURIComponent(messageSid)}/Media.json`;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      },
    });
    const jUnknown: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      let detail = "";
      if (typeof jUnknown === "object" && jUnknown && "message" in jUnknown) {
        const msg = (jUnknown as Record<string, unknown>).message;
        detail = typeof msg === "string" ? ` ${msg.slice(0, 120)}` : "";
      }
      return { ok: false, error: `list Media HTTP ${res.status}${detail}` };
    }
    const urls = absoluteTwilioMediaDownloadUrlsFromListPayload(jUnknown);
    return { ok: true, urls };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchTwilioBytes(
  absoluteUrl: string
): Promise<{ ok: true; buf: Uint8Array; ct: string | null } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing" };
  }
  try {
    const res = await fetch(absoluteUrl, {
      redirect: "follow",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      },
    });
    const rawCt = res.headers.get("content-type");
    const ctHeader = typeof rawCt === "string" ? rawCt : "";
    const lower = ctHeader.toLowerCase();
    const contentType =
      lower.includes("application/json") ? null : ctHeader.split(";")[0]?.trim() || null;

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${t.slice(0, 140)}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return { ok: true, buf, ct: contentType };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  loadLocalEnv();

  const days = parseArg("--days", 14);
  const rowLimit = parseArg("--limit", 250);
  const verbose = parseFlag("--verbose");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("[backfill-mms] Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).");
    process.exit(1);
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let tableProbe = "";
  const probe = await supabase.from("phone_message_attachments").select("id", { head: true, count: "exact" });
  if (probe.error) {
    tableProbe =
      probe.error.message.includes("does not exist") || probe.error.code === "42P01"
        ? 'Table "phone_message_attachments" missing — apply migration 20260501142000_phone_message_attachments.sql'
        : probe.error.message;
    console.warn("[backfill-mms] table_probe:", probe.error.code ?? "", probe.error.message);
  }

  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, conversation_id, external_message_sid, body, direction, deleted_at")
    .eq("direction", "inbound")
    .is("deleted_at", null)
    .gte("created_at", since)
    .not("external_message_sid", "is", null)
    .order("created_at", { ascending: false })
    .limit(rowLimit * 5);

  if (error || !rows) {
    console.error("[backfill-mms] load messages:", error?.message ?? "unknown");
    process.exit(1);
  }

  const skips: Record<string, number> = {};
  let processedMessages = 0;
  let ingestedParts = 0;

  const smsLike = rows.filter((r) => {
    const body = typeof r.body === "string" ? r.body.trim() : "";
    const sidRaw =
      typeof r.external_message_sid === "string" ? r.external_message_sid.trim() : "";
    if (!sidRaw) return false;
    if (body !== "") return false;
    return sidRaw.startsWith("SM") || sidRaw.startsWith("MM");
  });

  if (verbose) {
    console.info("[backfill-mms] candidate_snapshot", {
      loadedRows: rows.length,
      emptyBodyInboundSmsMmsCandidates: smsLike.length,
      rowCap: rowLimit,
    });
  }

  const candidates = smsLike.slice(0, rowLimit);

  function bump(skip: string, detail: Record<string, unknown>): void {
    skips[skip] = (skips[skip] ?? 0) + 1;
    if (verbose) console.info("[backfill-mms] skip:", skip, detail);
  }

  for (const r of candidates) {
    const body = typeof r.body === "string" ? r.body.trim() : "";
    const messageSid =
      typeof r.external_message_sid === "string" ? r.external_message_sid.trim() : "";
    const messageId = typeof r.id === "string" ? r.id : "";
    const conversationId = typeof r.conversation_id === "string" ? r.conversation_id : "";

    if (!messageId || !conversationId || !messageSid) {
      bump("missing_ids", {
        rowId: r.id,
        conversation_id: r.conversation_id,
        external_message_sid: r.external_message_sid,
      });
      continue;
    }

    const { count, error: cErr } = await supabase
      .from("phone_message_attachments")
      .select("id", { count: "exact", head: true })
      .eq("message_id", messageId);

    if (cErr) {
      bump("attachment_count_query_failed", {
        messageId,
        external_message_sid: messageSid,
        bodyLen: body.length,
        err: cErr.message,
        code: cErr.code,
      });
      continue;
    }
    if ((count ?? 0) > 0) {
      bump("already_has_attachments", {
        messageId,
        external_message_sid: messageSid,
        bodyLen: body.length,
      });
      continue;
    }

    const listed = await listTwilioMessageMediaUrls(messageSid);
    if (!listed.ok) {
      bump("twilio_list_failed", {
        messageId,
        external_message_sid: messageSid,
        bodyLen: body.length,
        detail: listed.error,
      });
      console.warn("[backfill-mms] twilio_list_failed", messageSid, listed.error);
      continue;
    }
    if (listed.urls.length === 0) {
      bump("twilio_list_empty_maybe_expired", {
        messageId,
        external_message_sid: messageSid,
        bodyLen: body.length,
      });
      console.warn("[backfill-mms] twilio_media_empty_after_list_ok", messageSid);
      continue;
    }

    processedMessages += 1;
    const urls = listed.urls.slice(0, 10);

    for (let i = 0; i < urls.length; i++) {
      const rawUrl = urls[i]!;
      const dl = await fetchTwilioBytes(rawUrl);
      if (dl.ok === false) {
        console.warn("[backfill-mms] download_fail", messageSid, i, dl.error);
        continue;
      }
      if (dl.buf.byteLength > DOWNLOAD_MAX_BYTES) {
        console.warn("[backfill-mms] too_large_skip", messageSid, i);
        continue;
      }
      const normCt =
        (dl.ct || "application/octet-stream").split(";")[0]!.trim().toLowerCase() ||
        "application/octet-stream";
      const suffix = sanitizeFileName(`mms-${messageSid.slice(-8)}-${i}`);
      const fileName =
        normCt.includes("pdf") ? `${suffix}.pdf` : normCt.includes("webp") ? `${suffix}.webp` : `${suffix}.jpg`;
      const storage_path = sanitizeFileName(`${conversationId}/${messageId}/${i}-${randomUUID()}-${fileName}`);
      const bodyBuf = Buffer.from(dl.buf);

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storage_path, bodyBuf, {
        contentType: normCt,
        upsert: false,
      });
      if (upErr) {
        console.warn("[backfill-mms] upload_fail", storage_path, upErr.message);
        continue;
      }

      const { error: insErr } = await supabase.from("phone_message_attachments").insert({
        message_id: messageId,
        conversation_id: conversationId,
        direction: "inbound",
        provider: "twilio",
        provider_message_sid: messageSid,
        provider_media_index: i,
        provider_media_url: rawUrl.slice(0, 4000),
        content_type: normCt,
        file_name: fileName,
        storage_bucket: BUCKET,
        storage_path,
        size_bytes: bodyBuf.byteLength,
      });
      const code = insErr?.code != null ? String(insErr.code) : "";
      if (insErr && code !== "23505") {
        console.warn("[backfill-mms] insert_fail", messageSid, i, insErr.message);
        await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => {});
      } else {
        ingestedParts += 1;
      }
    }
  }

  console.log("[backfill-mms] complete", {
    days,
    rowLimit,
    ...(tableProbe ? { migrationHint: tableProbe } : {}),
    messagesHydratedFromTwilio: processedMessages,
    mediaPartsInserted: ingestedParts,
    skipReasonCounts: skips,
    candidateInboundRowsExamined: candidates.length,
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
