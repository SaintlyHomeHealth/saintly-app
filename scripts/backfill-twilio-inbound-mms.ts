/**
 * Operational backfill: download Twilio MMS for inbound messages with MessageSid + empty body +
 * zero phone_message_attachments (older webhook / missed persist).
 *
 * Usage:
 *   npx tsx scripts/backfill-twilio-inbound-mms.ts [--days=14] [--limit=250] [--verbose]
 *   npx tsx scripts/backfill-twilio-inbound-mms.ts --sids=MMabc...,MMdef... [--verbose]
 *   npx tsx scripts/backfill-twilio-inbound-mms.ts --sids=MM... --only-sids   # do not scan --days window
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { absoluteTwilioMediaDownloadUrlsFromListPayload } from "../src/lib/phone/twilio-media-fetch";

const BUCKET = "phone-message-media";
const DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
const MEDIA_PAGE_CAP = 8;
const MEDIA_ITEMS_CAP = 30;

/** User-facing verbatim reasons for skip summaries / ops logs. */
const R = {
  missingRelation: "missing relation",
  missingBucket: "missing bucket",
  twilioAuthFailed: "Twilio auth failed",
  twilioMediaListEmpty: "Twilio REST media list empty",
  twilioListHttpError: "Twilio REST media list HTTP error",
  mediaDownloadFailed: "media download failed",
  storageUploadFailed: "Supabase storage upload failed",
  attachmentInsertFailed: "attachment insert failed",
  rowNotFoundForSid: "message row not found for external_message_sid",
  alreadyHasAttachments: "already has attachments",
  nonEmptyBody: "non-empty body skipped",
  badSidPrefix: "external_message_sid not SM/MM",
} as const;

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

/** Comma-separated --sids=MM...,SM... */
function parseSidsArg(): string[] {
  const raw = process.argv.find((a) => a.startsWith("--sids="));
  if (!raw) return [];
  return raw
    .slice("--sids=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function sanitizeFileName(base: string): string {
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "file";
}

function absoluteTwilioUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (t.startsWith("http")) return t;
  return `https://api.twilio.com${t.startsWith("/") ? t : `/${t}`}`;
}

async function listTwilioMessageMediaUrlsAllPages(
  messageSid: string,
  verbose: boolean
): Promise<
  | { ok: true; urls: string[] }
  | { ok: false; reason: typeof R.twilioAuthFailed | typeof R.twilioListHttpError; detail: string }
> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !token) {
    return {
      ok: false,
      reason: R.twilioAuthFailed,
      detail: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN unset",
    };
  }

  const authHeader = `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`;
  let nextUrl =
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/` +
    `${encodeURIComponent(messageSid)}/Media.json`;

  const collected: string[] = [];
  const seenPages = new Set<string>();

  try {
    for (let page = 0; page < MEDIA_PAGE_CAP; page++) {
      if (seenPages.has(nextUrl)) break;
      seenPages.add(nextUrl);

      const res = await fetch(nextUrl, {
        redirect: "follow",
        headers: { Authorization: authHeader },
      });
      const jUnknown: unknown = await res.json().catch(() => null);

      if (res.status === 401 || res.status === 403) {
        let detail = `HTTP ${res.status}`;
        if (typeof jUnknown === "object" && jUnknown && "message" in jUnknown) {
          const msg = (jUnknown as Record<string, unknown>).message;
          detail = typeof msg === "string" ? msg.slice(0, 200) : detail;
        }
        return { ok: false, reason: R.twilioAuthFailed, detail };
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        if (typeof jUnknown === "object" && jUnknown && "message" in jUnknown) {
          const msg = (jUnknown as Record<string, unknown>).message;
          if (typeof msg === "string") detail = `${detail}: ${msg.slice(0, 200)}`;
        }
        return { ok: false, reason: R.twilioListHttpError, detail };
      }

      const pageUrls = absoluteTwilioMediaDownloadUrlsFromListPayload(jUnknown);
      for (const u of pageUrls) {
        if (collected.length >= MEDIA_ITEMS_CAP) break;
        collected.push(u);
      }

      const rec =
        jUnknown && typeof jUnknown === "object" && !Array.isArray(jUnknown)
          ? (jUnknown as Record<string, unknown>)
          : {};
      const nu = rec.next_page_uri;
      const np = nu != null ? String(nu).trim() : "";
      if (!np || collected.length >= MEDIA_ITEMS_CAP) break;

      nextUrl = absoluteTwilioUrl(np);
    }

    if (verbose && collected.length === 0) {
      console.info("[backfill-mms] Twilio REST media list empty (diagnostic)", {
        messageSid,
        hint:
          "Valid 200 responses with zero parsed URIs, or MMS media expired (>~13 days) / wrong Twilio Account SID for this MessageSid.",
      });
    }

    return { ok: true, urls: collected };
  } catch (e) {
    return {
      ok: false,
      reason: R.twilioListHttpError,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

async function fetchTwilioBytes(
  absoluteUrl: string
): Promise<{ ok: true; buf: Uint8Array; ct: string | null } | { ok: false; error: string; authReject?: boolean }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !token) {
    return { ok: false, error: `${R.twilioAuthFailed}: missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN` };
  }
  try {
    const res = await fetch(absoluteUrl, {
      redirect: "follow",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`,
      },
    });
    const rawCt = res.headers.get("content-type");
    const ctHeader = typeof rawCt === "string" ? rawCt : "";
    const lower = ctHeader.toLowerCase();
    const contentType =
      lower.includes("application/json") ? null : ctHeader.split(";")[0]?.trim() || null;

    if (res.status === 401 || res.status === 403) {
      const t = await res.text().catch(() => "");
      return {
        ok: false,
        error: `${R.twilioAuthFailed}: HTTP ${res.status} ${t.slice(0, 120)}`,
        authReject: true,
      };
    }

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

function isMissingBucketErr(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("bucket not found") || m.includes('bucket "phone-message-media"') || /not\s+exist.*bucket/i.test(m);
}

async function main() {
  loadLocalEnv();

  const days = parseArg("--days", 14);
  const rowLimit = parseArg("--limit", 250);
  const verbose = parseFlag("--verbose");
  const explicitSids = parseSidsArg();
  const onlyExplicitSids = parseFlag("--only-sids");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("[backfill-mms] Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).");
    process.exit(1);
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const skips: Record<string, number> = {};
  let processedMessages = 0;
  let ingestedParts = 0;

  let missingRelationBoot = false;
  const probe = await supabase.from("phone_message_attachments").select("id", { head: true, count: "exact" });
  if (probe.error) {
    missingRelationBoot =
      probe.error.message.includes("does not exist") || probe.error.code === "42P01";
    console.warn("[backfill-mms] table_probe:", probe.error.code ?? "", probe.error.message);
    if (missingRelationBoot) {
      console.error("[backfill-mms]", R.missingRelation, "— apply migration 20260501142000_phone_message_attachments.sql");
      process.exit(1);
    }
  }

  const selectCols = "id, conversation_id, external_message_sid, body, direction, deleted_at";

  const bySid = new Map<string, Record<string, unknown>>();

  if (explicitSids.length > 0) {
    console.log("[backfill-mms] explicit_sids", explicitSids);
    const { data: sidRows, error: sidErr } = await supabase
      .from("messages")
      .select(selectCols)
      .eq("direction", "inbound")
      .is("deleted_at", null)
      .in("external_message_sid", explicitSids);
    if (sidErr || !sidRows) {
      console.error("[backfill-mms] explicit sid query failed:", sidErr?.message ?? "unknown");
      process.exit(1);
    }
    for (const s of explicitSids) {
      const row = sidRows.find(
        (r) =>
          typeof (r as { external_message_sid?: unknown }).external_message_sid === "string" &&
          ((r as { external_message_sid: string }).external_message_sid ?? "").trim() === s.trim()
      );
      if (!row) {
        console.warn("[backfill-mms] skip:", R.rowNotFoundForSid, { external_message_sid: s });
        skips[R.rowNotFoundForSid] = (skips[R.rowNotFoundForSid] ?? 0) + 1;
      } else {
        bySid.set(s.trim(), row as Record<string, unknown>);
      }
    }
  }

  const { data: rows, error } =
    explicitSids.length > 0 && onlyExplicitSids
      ? { data: [] as Record<string, unknown>[], error: null }
      : await supabase
          .from("messages")
          .select(selectCols)
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

  function isEmptyBodyMmsCandidate(r: Record<string, unknown>): boolean {
    const body = typeof r.body === "string" ? r.body.trim() : "";
    const sidRaw =
      typeof r.external_message_sid === "string" ? r.external_message_sid.trim() : "";
    if (!sidRaw) return false;
    if (body !== "") return false;
    return sidRaw.startsWith("SM") || sidRaw.startsWith("MM");
  }

  const windowSmsLike = rows.filter(isEmptyBodyMmsCandidate);

  const seenIds = new Set<string>();
  const candidatesRaw: Record<string, unknown>[] = [];

  function pushCandidate(r: Record<string, unknown>): void {
    const id = typeof r.id === "string" ? r.id : "";
    if (!id || seenIds.has(id)) return;
    if (candidatesRaw.length >= rowLimit) return;
    seenIds.add(id);
    candidatesRaw.push(r);
  }

  if (explicitSids.length === 0) {
    for (const r of windowSmsLike) {
      pushCandidate(r);
    }
  } else {
    for (const sid of explicitSids) {
      const r = bySid.get(sid.trim());
      if (r) pushCandidate(r);
    }
    if (!onlyExplicitSids) {
      for (const r of windowSmsLike) {
        pushCandidate(r);
      }
    }
  }

  function bump(skip: string, detail: Record<string, unknown>): void {
    skips[skip] = (skips[skip] ?? 0) + 1;
    console.info("[backfill-mms] skip:", skip, detail);
  }

  /** Verbose / explicit-SID trace lines in addition to `[backfill-mms] skip:` */
  function logVerbose(detail: Record<string, unknown>) {
    if (verbose || explicitSids.length > 0) {
      console.info("[backfill-mms] verbose:", detail);
    }
  }

  if (verbose) {
    console.info("[backfill-mms] candidate_snapshot", {
      windowLoadedRows: rows.length,
      windowEmptyBodyMms: windowSmsLike.length,
      explicitSidsRequested: explicitSids,
      onlyExplicitSids,
      mergedCandidates: candidatesRaw.length,
      rowCap: rowLimit,
      since,
    });
  }

  for (const r of candidatesRaw) {
    const body = typeof r.body === "string" ? r.body.trim() : "";
    const messageSid =
      typeof r.external_message_sid === "string" ? r.external_message_sid.trim() : "";
    const messageId = typeof r.id === "string" ? r.id : "";
    const conversationId = typeof r.conversation_id === "string" ? r.conversation_id : "";

    if (!messageId || !conversationId || !messageSid) {
      bump("missing_db_ids", {
        rowId: r.id,
        conversation_id: r.conversation_id,
        external_message_sid: r.external_message_sid,
      });
      continue;
    }

    if (!messageSid.startsWith("SM") && !messageSid.startsWith("MM")) {
      bump(R.badSidPrefix, { messageId, external_message_sid: messageSid });
      continue;
    }

    if (body !== "") {
      bump(R.nonEmptyBody, { messageId, external_message_sid: messageSid, bodyLen: body.length });
      continue;
    }

    const { count, error: cErr } = await supabase
      .from("phone_message_attachments")
      .select("id", { count: "exact", head: true })
      .eq("message_id", messageId);

    if (cErr) {
      const mr = cErr.code === "42P01" || cErr.message.includes("does not exist");
      bump(mr ? R.missingRelation : "attachment_count_query_failed", {
        messageId,
        external_message_sid: messageSid,
        detail: cErr.message,
        code: cErr.code,
      });
      continue;
    }
    if ((count ?? 0) > 0) {
      bump(R.alreadyHasAttachments, { messageId, external_message_sid: messageSid });
      continue;
    }

    console.log("[backfill-mms] processing", {
      external_message_sid: messageSid,
      message_id: messageId,
      conversation_id: conversationId,
    });

    const listed = await listTwilioMessageMediaUrlsAllPages(messageSid, verbose);
    if (listed.ok === false) {
      bump(listed.reason, {
        external_message_sid: messageSid,
        message_id: messageId,
        detail: listed.detail,
      });
      logVerbose({
        sid: messageSid,
        outcome: listed.reason,
        detail: listed.detail,
      });
      continue;
    }
    if (listed.urls.length === 0) {
      bump(R.twilioMediaListEmpty, {
        external_message_sid: messageSid,
        message_id: messageId,
      });
      logVerbose({ sid: messageSid, outcome: R.twilioMediaListEmpty });
      continue;
    }

    processedMessages += 1;
    let anyPartInserted = false;
    const urls = listed.urls.slice(0, 10);

    for (let i = 0; i < urls.length; i++) {
      const rawUrl = urls[i]!;
      const dl = await fetchTwilioBytes(rawUrl);
      if (dl.ok === false) {
        bump(dl.authReject === true ? R.twilioAuthFailed : R.mediaDownloadFailed, {
          external_message_sid: messageSid,
          message_id: messageId,
          partIndex: i,
          detail: dl.error,
          mediaUrlSnippet: rawUrl.slice(0, 120),
        });
        continue;
      }
      if (dl.buf.byteLength > DOWNLOAD_MAX_BYTES) {
        bump("media_download_too_large", {
          external_message_sid: messageSid,
          message_id: messageId,
          bytes: dl.buf.byteLength,
          max: DOWNLOAD_MAX_BYTES,
        });
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
        const bucketHint = isMissingBucketErr(upErr.message) ? R.missingBucket : "";
        bump(R.storageUploadFailed, {
          external_message_sid: messageSid,
          message_id: messageId,
          partIndex: i,
          detail: upErr.message,
          ...(bucketHint ? { classifiedAs: bucketHint } : {}),
        });
        if (bucketHint) {
          console.error("[backfill-mms]", R.missingBucket, "(upload error):", upErr.message);
        }
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
        bump(R.attachmentInsertFailed, {
          external_message_sid: messageSid,
          message_id: messageId,
          partIndex: i,
          detail: insErr.message,
          code: insErr.code,
        });
        await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => {});
      } else {
        ingestedParts += 1;
        anyPartInserted = true;
        console.log("[backfill-mms] inserted attachment", {
          external_message_sid: messageSid,
          message_id: messageId,
          partIndex: i,
          storage_path,
        });
      }
    }

    if (!anyPartInserted && urls.length > 0) {
      bump("all_parts_failed_for_message", {
        external_message_sid: messageSid,
        message_id: messageId,
        attemptedParts: urls.length,
      });
    }
  }

  console.log("[backfill-mms] complete", {
    days,
    since,
    rowLimit,
    ...(explicitSids.length ? { explicitSidsRequested: explicitSids, onlyExplicitSids } : {}),
    messagesHydratedFromTwilio: processedMessages,
    mediaPartsInserted: ingestedParts,
    skipReasonCounts: skips,
    candidateInboundRowsExamined: candidatesRaw.length,
  });
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
