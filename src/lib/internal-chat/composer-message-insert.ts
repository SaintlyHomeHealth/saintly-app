import "server-only";

import { insertAuditLogTrusted } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { encryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import { INTERNAL_CHAT_REF_KINDS, type InternalChatRefKind } from "@/lib/internal-chat/internal-chat-ref-kinds";
import {
  extractPatientMentionIdsFromCanonical,
  extractReferenceTokensFromCanonical,
  extractStaffMentionIdsFromCanonical,
  mergePicksIntoCanonical,
  type InternalChatRefPick,
  type MentionPick,
} from "@/lib/internal-chat/mention-tokens";
import { notifyInternalChatRecipients } from "@/lib/internal-chat/notify-members";
import {
  assertEmployeeUserIdsPostable,
  assertFacilityIdsPostable,
  assertLeadIdsPostable,
  assertPatientIdsPostable,
  assertRecruitApplicantIdsPostable,
} from "@/lib/internal-chat/reference-validate";
import type { StaffProfile } from "@/lib/staff-profile";

function isRefKind(s: string): s is InternalChatRefKind {
  return (INTERNAL_CHAT_REF_KINDS as readonly string[]).includes(s);
}

function idsByRefKind(refs: InternalChatRefPick[], kind: InternalChatRefKind): string[] {
  return [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
}

function submittedRefMap(refs: InternalChatRefPick[]): Map<string, Set<InternalChatRefKind>> {
  const m = new Map<string, Set<InternalChatRefKind>>();
  for (const r of refs) {
    const s = m.get(r.id) ?? new Set();
    s.add(r.kind);
    m.set(r.id, s);
  }
  return m;
}

function extractedRefMap(
  tokens: ReturnType<typeof extractReferenceTokensFromCanonical>
): Map<string, Set<InternalChatRefKind>> {
  return submittedRefMap(tokens.map((t) => ({ kind: t.kind, id: t.id, label: t.label })));
}

function refMapsEqual(
  a: Map<string, Set<InternalChatRefKind>>,
  b: Map<string, Set<InternalChatRefKind>>
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, kinds] of a) {
    const o = b.get(id);
    if (!o || o.size !== kinds.size) return false;
    for (const k of kinds) {
      if (!o.has(k)) return false;
    }
  }
  return true;
}

export type ComposerMessageBodyJson = {
  text?: string;
  staffMentions?: Array<{ userId?: string; label?: string }>;
  patientMentions?: Array<{ patientId?: string; label?: string }>;
  referenceMentions?: Array<{ type?: string; id?: string; label?: string }>;
  attachmentPath?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
};

export type InsertComposerOptions = {
  /** When true, allow empty text/refs when uploading files via multipart API. */
  allowEmptyForFileUpload?: boolean;
  /** Encrypt only canonical markdown (no legacy 📎 placeholder for UI list). */
  plaintextCanonicalOnly?: boolean;
  skipNotify?: boolean;
};

export type InsertComposerResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; error: string };

export async function insertInternalChatComposerMessage(
  staff: StaffProfile,
  chatId: string,
  bodyJson: ComposerMessageBodyJson,
  opts?: InsertComposerOptions
): Promise<InsertComposerResult> {
  const displayText = typeof bodyJson.text === "string" ? bodyJson.text : "";
  const staffPickRaw = Array.isArray(bodyJson.staffMentions) ? bodyJson.staffMentions : [];
  const patientPickRaw = Array.isArray(bodyJson.patientMentions) ? bodyJson.patientMentions : [];
  const referenceRaw = Array.isArray(bodyJson.referenceMentions) ? bodyJson.referenceMentions : [];

  const staffPicks: MentionPick[] = staffPickRaw
    .map((r) => ({
      id: String(r.userId ?? "").trim(),
      label: String(r.label ?? "").trim(),
    }))
    .filter((p) => p.id && p.label)
    .slice(0, 25);

  const legacyPatientPicks: MentionPick[] = patientPickRaw
    .map((r) => ({
      id: String(r.patientId ?? "").trim(),
      label: String(r.label ?? "").trim(),
    }))
    .filter((p) => p.id && p.label)
    .slice(0, 8);

  const referencePicks: InternalChatRefPick[] = referenceRaw
    .map((r) => {
      const t = String(r.type ?? "").trim();
      if (!isRefKind(t)) return null;
      return {
        kind: t,
        id: String(r.id ?? "").trim(),
        label: String(r.label ?? "").trim(),
      };
    })
    .filter((x): x is InternalChatRefPick => Boolean(x && x.id && x.label))
    .slice(0, 25);

  const refKey = (r: InternalChatRefPick) => `${r.kind}:${r.id}`;
  const refSeen = new Set<string>();
  const allRefs: InternalChatRefPick[] = [];
  for (const r of referencePicks) {
    const k = refKey(r);
    if (refSeen.has(k)) continue;
    refSeen.add(k);
    allRefs.push(r);
  }
  for (const p of legacyPatientPicks) {
    const r: InternalChatRefPick = { kind: "patient", id: p.id, label: p.label };
    const k = refKey(r);
    if (refSeen.has(k)) continue;
    refSeen.add(k);
    allRefs.push(r);
  }

  const attachmentPathEarly =
    typeof bodyJson.attachmentPath === "string" && bodyJson.attachmentPath.trim()
      ? bodyJson.attachmentPath.trim()
      : null;

  if (
    !displayText.trim() &&
    !attachmentPathEarly &&
    staffPicks.length === 0 &&
    allRefs.length === 0 &&
    !opts?.allowEmptyForFileUpload
  ) {
    return { ok: false, status: 400, error: "empty" };
  }

  const canonical = mergePicksIntoCanonical(
    displayText,
    staffPicks,
    referencePicks,
    legacyPatientPicks.length > 0 ? legacyPatientPicks : undefined
  );
  const mentionUserIds = extractStaffMentionIdsFromCanonical(canonical);
  const extracted = extractReferenceTokensFromCanonical(canonical);
  const submitted = submittedRefMap(allRefs);
  const fromCanon = extractedRefMap(extracted);

  if (!refMapsEqual(submitted, fromCanon)) {
    return { ok: false, status: 400, error: "reference_mention_mismatch" };
  }

  if (
    !(await assertPatientIdsPostable(
      staff,
      extracted.filter((e) => e.kind === "patient").map((e) => e.id)
    ))
  ) {
    return { ok: false, status: 403, error: "patient_mention_forbidden" };
  }
  if (!(await assertLeadIdsPostable(staff, idsByRefKind(allRefs, "lead")))) {
    return { ok: false, status: 403, error: "lead_mention_forbidden" };
  }
  if (!(await assertFacilityIdsPostable(staff, idsByRefKind(allRefs, "facility")))) {
    return { ok: false, status: 403, error: "facility_mention_forbidden" };
  }
  if (!(await assertEmployeeUserIdsPostable(staff, idsByRefKind(allRefs, "employee")))) {
    return { ok: false, status: 403, error: "employee_mention_forbidden" };
  }
  if (!(await assertRecruitApplicantIdsPostable(staff, idsByRefKind(allRefs, "recruit")))) {
    return { ok: false, status: 403, error: "recruit_mention_forbidden" };
  }

  if (mentionUserIds.length > 0) {
    const { data: mems } = await supabaseAdmin
      .from("internal_chat_members")
      .select("user_id")
      .eq("chat_id", chatId)
      .in("user_id", mentionUserIds);
    const ok = new Set((mems ?? []).map((m) => String(m.user_id)));
    for (const id of mentionUserIds) {
      if (!ok.has(id)) {
        return { ok: false, status: 400, error: "invalid_mention" };
      }
    }
  }

  const attachmentPath = attachmentPathEarly;
  const attachmentMime =
    typeof bodyJson.attachmentMime === "string" && bodyJson.attachmentMime.trim()
      ? bodyJson.attachmentMime.trim()
      : null;
  const attachmentName =
    typeof bodyJson.attachmentName === "string" && bodyJson.attachmentName.trim()
      ? bodyJson.attachmentName.trim().slice(0, 200)
      : null;

  const mentionPatientIds = [...new Set(extractPatientMentionIdsFromCanonical(canonical))];

  let plain: string;
  if (opts?.plaintextCanonicalOnly) {
    plain = canonical.trim();
  } else {
    plain =
      canonical.trim() ||
      (attachmentName
        ? `📎 ${attachmentName}`
        : attachmentPath
          ? "Attachment"
          : allRefs.length
            ? "Reference"
            : " ");
  }

  const { ciphertext, nonce } = encryptInternalChatUtf8(plain);

  const insertRow: Record<string, unknown> = {
    chat_id: chatId,
    sender_id: staff.user_id,
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    attachment_path: attachmentPath,
    attachment_mime: attachmentMime,
    attachment_name: attachmentName,
    mention_user_ids: mentionUserIds,
    mention_patient_ids: mentionPatientIds,
  };

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("internal_chat_messages")
    .insert(insertRow)
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    console.warn("[internal-chat/composer insert]", insErr?.message);
    return { ok: false, status: 500, error: "insert_failed" };
  }

  const messageId = String(inserted.id);

  await insertAuditLogTrusted({
    action: "internal_chat_message_sent",
    entityType: "internal_chat",
    entityId: chatId,
    metadata: {
      message_id: messageId,
      body_length: plain.length,
      has_attachment: Boolean(attachmentPath),
      reference_mention_count: allRefs.length,
    },
  });

  if (!opts?.skipNotify) {
    void notifyInternalChatRecipients({ chatId, senderUserId: staff.user_id });
  }

  return { ok: true, messageId };
}
