/**
 * Shared SMS inbox “last message preview” helpers for workspace + admin list routes.
 * Same cap semantics everywhere so preview quality stays consistent and queries stay bounded.
 *
 * Preview rows use `ORDER BY created_at DESC` + limit, then first row per `conversation_id` wins
 * (see `smsInboxPreviewSelectionsFromMessages`). A DB-side `DISTINCT ON (conversation_id)` would
 * return the true latest per thread in one row per conv (often fewer rows read) but can differ
 * from the capped scan when the cap truncates; treat as a product/perf tradeoff — needs approval.
 */

/** Upper bound on message rows scanned to build per-conversation previews (newest-first walk). */
export const SMS_INBOX_PREVIEW_ROW_CAP_MAX = 100;
export const SMS_INBOX_PREVIEW_ROW_CAP_MIN = 40;
/** Multiplier: expect up to this many recent rows per thread before hitting the cap in typical traffic. */
export const SMS_INBOX_PREVIEW_ROWS_PER_CONV_FACTOR = 8;

/**
 * How many `messages` rows to fetch when building preview snippets for `conversationCount` threads.
 * Matches the workspace inbox formula; admin inbox uses the same limit (previously unbounded).
 */
export function smsInboxPreviewMessageRowCap(conversationCount: number): number {
  if (conversationCount <= 0) return 0;
  return Math.min(
    SMS_INBOX_PREVIEW_ROW_CAP_MAX,
    Math.max(SMS_INBOX_PREVIEW_ROW_CAP_MIN, conversationCount * SMS_INBOX_PREVIEW_ROWS_PER_CONV_FACTOR)
  );
}

export type PreviewMessageRow = {
  conversation_id?: string | null;
  body?: string | null;
  id?: string | null;
};

export type SmsInboxPreviewSelections = {
  previewByConversationId: Record<string, string>;
  /** Most recent scanned message row id used per conversation — for MMS attachment preview joins. */
  messageIdByConversationId: Record<string, string>;
};

/**
 * First-seen row per `conversation_id` wins (input must be ordered newest-first).
 * Truncates body to `previewMaxChars` with an ellipsis when longer.
 */
export function smsInboxPreviewSelectionsFromMessages(
  rows: PreviewMessageRow[] | null | undefined,
  previewMaxChars: number
): SmsInboxPreviewSelections {
  const previewByConversationId: Record<string, string> = {};
  const messageIdByConversationId: Record<string, string> = {};
  if (!rows?.length) return { previewByConversationId, messageIdByConversationId };
  const seen = new Set<string>();
  for (const m of rows) {
    const cid = typeof m.conversation_id === "string" ? m.conversation_id : "";
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    const mid = typeof m.id === "string" && m.id.trim() ? m.id.trim() : "";
    if (mid) {
      messageIdByConversationId[cid] = mid;
    }
    const body = typeof m.body === "string" ? m.body.trim() : "";
    previewByConversationId[cid] =
      body.slice(0, previewMaxChars) + (body.length > previewMaxChars ? "…" : "");
  }
  return { previewByConversationId, messageIdByConversationId };
}

export type AttachmentTotalsForPreview = {
  imageCount: number;
  nonImageCount: number;
};

/**
 * Replace empty previews with Photo / Attachment when the latest-visible message carries MMS blobs.
 */
export function smsInboxPreviewsAugmentWithAttachmentTotals(
  previewByConversationId: Record<string, string>,
  messageIdByConversationId: Record<string, string>,
  totalsByMessageId: Record<string, AttachmentTotalsForPreview | undefined>
): Record<string, string> {
  const out = { ...previewByConversationId };
  for (const [cid, messageId] of Object.entries(messageIdByConversationId)) {
    const current = typeof out[cid] === "string" ? out[cid].trim() : "";
    if (current) continue;
    const t = totalsByMessageId[messageId];
    if (!t || t.imageCount + t.nonImageCount === 0) continue;
    if (t.nonImageCount === 0 && t.imageCount > 0) {
      out[cid] = "Photo";
    } else {
      out[cid] = "Attachment";
    }
  }
  return out;
}

/**
 * Convenience wrapper preserving the original return shape.
 */
export function buildSmsInboxPreviewByConversationId(
  rows: PreviewMessageRow[] | null | undefined,
  previewMaxChars: number
): Record<string, string> {
  return smsInboxPreviewSelectionsFromMessages(rows, previewMaxChars).previewByConversationId;
}
