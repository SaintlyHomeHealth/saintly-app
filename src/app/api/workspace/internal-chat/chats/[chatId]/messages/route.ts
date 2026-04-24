import { NextResponse, type NextRequest } from "next/server";

import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { assertInternalChatMember, canPostToInternalChat } from "@/lib/internal-chat/access";
import { decryptInternalChatUtf8, encryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import { INTERNAL_CHAT_REF_KINDS, type InternalChatRefKind } from "@/lib/internal-chat/internal-chat-ref-kinds";
import {
  extractPatientMentionIdsFromCanonical,
  extractReferenceTokensFromCanonical,
  extractStaffMentionIdsFromCanonical,
  internalChatBodyForDisplay,
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
  buildHrefForReference,
  mapUserIdsToStaffRowIds,
} from "@/lib/internal-chat/reference-validate";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ chatId: string }> };

function bufFromB64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function isRefKind(s: string): s is InternalChatRefKind {
  return (INTERNAL_CHAT_REF_KINDS as readonly string[]).includes(s);
}

type RefCardOut = { kind: InternalChatRefKind; id: string; label: string; href: string | null };
type LegacyPatientMention = { id: string; label: string; href: string };

function resolveReferenceCardsForViewerSync(
  bodyCanonical: string,
  pidsFromRow: string[],
  staff: NonNullable<Awaited<ReturnType<typeof getStaffProfile>>>,
  userToStaffRow: Map<string, string>,
  patientLabelById: Map<string, string>
): { referenceCards: RefCardOut[]; patientMentions: LegacyPatientMention[] } {
  let tokens = extractReferenceTokensFromCanonical(bodyCanonical);
  if (tokens.length === 0 && pidsFromRow.length > 0) {
    tokens = pidsFromRow.map((id) => ({ kind: "patient" as const, id: String(id), label: "Patient" }));
  }

  const referenceCards: RefCardOut[] = tokens.map((t) => {
    const staffRowId = t.kind === "employee" ? userToStaffRow.get(t.id) ?? null : null;
    const label = t.kind === "patient" ? (patientLabelById.get(t.id) ?? t.label) : t.label;
    return {
      kind: t.kind,
      id: t.id,
      label,
      href: buildHrefForReference(t.kind, t.id, staff, staffRowId),
    };
  });

  const patientMentions: LegacyPatientMention[] = referenceCards
    .filter((c) => c.kind === "patient")
    .map((c) => ({
      id: c.id,
      label: c.label,
      href: c.href ?? `/workspace/phone/patients/${c.id}`,
    }));

  return { referenceCards, patientMentions };
}

async function resolvePatientMentionCardLabels(
  patientIds: string[]
): Promise<Array<{ id: string; label: string }>> {
  if (patientIds.length === 0) return [];
  const { data: rows } = await supabaseAdmin
    .from("patients")
    .select("id, contacts ( full_name, first_name, last_name )")
    .in("id", patientIds);

  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    const raw = row.contacts as
      | {
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        }
      | Array<{
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        }>
      | null
      | undefined;
    const emb = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    map.set(String(row.id), displayNameFromContact(emb));
  }
  return patientIds.map((id) => ({ id, label: map.get(id) ?? "Patient" }));
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  if (!cid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const member = await assertInternalChatMember(cid, staff.user_id);
  if (!member) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const canPost = member.member_role !== "read_only";

  const { data: messages, error } = await supabaseAdmin
    .from("internal_chat_messages")
    .select(
      "id, chat_id, sender_id, created_at, ciphertext, nonce, attachment_path, attachment_mime, attachment_name, mention_user_ids, mention_patient_ids"
    )
    .eq("chat_id", cid)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.warn("[internal-chat/messages GET]", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const senderIds = [...new Set((messages ?? []).map((m) => String(m.sender_id)))];
  const { data: profiles } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .in("user_id", senderIds);

  const senderLabel = new Map(
    (profiles ?? []).map((p) => [
      String(p.user_id),
      (typeof p.full_name === "string" && p.full_name.trim()) ||
        (typeof p.email === "string" && p.email.trim()) ||
        "Staff",
    ])
  );

  const msgIds = (messages ?? []).map((m) => String(m.id));
  const readByMessage = new Map<string, string[]>();
  if (msgIds.length > 0) {
    const { data: reads } = await supabaseAdmin
      .from("internal_chat_message_reads")
      .select("message_id, user_id")
      .in("message_id", msgIds);
    for (const r of reads ?? []) {
      const mid = String(r.message_id);
      const arr = readByMessage.get(mid) ?? [];
      arr.push(String(r.user_id));
      readByMessage.set(mid, arr);
    }
  }

  const decr: Array<{
    id: string;
    senderId: string;
    createdAt: string;
    bodyDisplay: string;
    bodyCanonical: string;
    pids: string[];
    attach: { path: string | null; mime: string | null; name: string | null };
    mentionUids: string[];
    readUids: string[];
  }> = [];

  for (const m of messages ?? []) {
    let bodyCanonical = "";
    try {
      const ct = typeof m.ciphertext === "string" ? m.ciphertext : "";
      const nn = typeof m.nonce === "string" ? m.nonce : "";
      bodyCanonical = decryptInternalChatUtf8(bufFromB64(ct), bufFromB64(nn));
    } catch {
      bodyCanonical = "";
    }
    const bodyDisplay = internalChatBodyForDisplay(bodyCanonical);
    const pids = (m.mention_patient_ids ?? []) as string[];
    decr.push({
      id: String(m.id),
      senderId: m.sender_id,
      createdAt: m.created_at,
      bodyDisplay,
      bodyCanonical,
      pids,
      attach: {
        path: m.attachment_path,
        mime: m.attachment_mime,
        name: m.attachment_name,
      },
      mentionUids: (m.mention_user_ids ?? []) as string[],
      readUids: readByMessage.get(String(m.id)) ?? [],
    });
  }

  const allEmployeeUserIds = new Set<string>();
  const allPatientIds = new Set<string>();
  for (const d of decr) {
    let toks = extractReferenceTokensFromCanonical(d.bodyCanonical);
    if (toks.length === 0 && d.pids.length > 0) {
      toks = d.pids.map((id) => ({ kind: "patient" as const, id: String(id), label: "Patient" }));
    }
    for (const t of toks) {
      if (t.kind === "employee") allEmployeeUserIds.add(t.id);
      if (t.kind === "patient") allPatientIds.add(t.id);
    }
    for (const p of d.pids) allPatientIds.add(String(p));
  }

  const [userToStaffRow, patientLabels] = await Promise.all([
    mapUserIdsToStaffRowIds([...allEmployeeUserIds]),
    resolvePatientMentionCardLabels([...allPatientIds]),
  ]);
  const patientLabelById = new Map(patientLabels.map((r) => [r.id, r.label]));

  const out = decr.map((d) => {
    const { referenceCards, patientMentions } = resolveReferenceCardsForViewerSync(
      d.bodyCanonical,
      d.pids,
      staff,
      userToStaffRow,
      patientLabelById
    );
    return {
      id: d.id,
      senderId: d.senderId,
      senderLabel: senderLabel.get(String(d.senderId)) ?? "Staff",
      createdAt: d.createdAt,
      body: d.bodyDisplay,
      attachmentPath: d.attach.path,
      attachmentMime: d.attach.mime,
      attachmentName: d.attach.name,
      mentionUserIds: d.mentionUids,
      readByUserIds: d.readUids,
      referenceCards,
      patientMentions,
    };
  });

  await insertAuditLogTrusted({
    action: "internal_chat_thread_viewed",
    entityType: "internal_chat",
    entityId: cid,
    metadata: { message_count: out.length },
  });

  const { data: mem } = await supabaseAdmin
    .from("internal_chat_members")
    .select("notifications_muted, pinned_at")
    .eq("chat_id", cid)
    .eq("user_id", staff.user_id)
    .maybeSingle();

  return NextResponse.json({
    messages: out,
    notificationsMuted: mem?.notifications_muted === true,
    pinned: Boolean(mem?.pinned_at),
    memberRole: member.member_role,
    canPost,
  });
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

function extractedRefMap(tokens: ReturnType<typeof extractReferenceTokensFromCanonical>): Map<string, Set<InternalChatRefKind>> {
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

export async function POST(req: NextRequest, { params }: RouteParams) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { chatId } = await params;
  const cid = typeof chatId === "string" ? chatId.trim() : "";
  if (!cid) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (!(await canPostToInternalChat(cid, staff.user_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: chatRow } = await supabaseAdmin
    .from("internal_chats")
    .select("id, chat_type")
    .eq("id", cid)
    .maybeSingle();

  const chatType = typeof chatRow?.chat_type === "string" ? chatRow.chat_type : "";

  let bodyJson: {
    text?: string;
    staffMentions?: Array<{ userId?: string; label?: string }>;
    patientMentions?: Array<{ patientId?: string; label?: string }>;
    referenceMentions?: Array<{ type?: string; id?: string; label?: string }>;
    attachmentPath?: string | null;
    attachmentMime?: string | null;
    attachmentName?: string | null;
  };
  try {
    bodyJson = (await req.json()) as typeof bodyJson;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

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

  if (allRefs.length > 0 && chatType !== "company" && chatType !== "team") {
    return NextResponse.json({ error: "reference_mentions_not_allowed" }, { status: 400 });
  }

  const attachmentPathEarly =
    typeof bodyJson.attachmentPath === "string" && bodyJson.attachmentPath.trim()
      ? bodyJson.attachmentPath.trim()
      : null;

  if (!displayText.trim() && !attachmentPathEarly && staffPicks.length === 0 && allRefs.length === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
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
    return NextResponse.json({ error: "reference_mention_mismatch" }, { status: 400 });
  }

  if (
    !(await assertPatientIdsPostable(
      staff,
      extracted.filter((e) => e.kind === "patient").map((e) => e.id)
    ))
  ) {
    return NextResponse.json({ error: "patient_mention_forbidden" }, { status: 403 });
  }
  if (
    !(await assertLeadIdsPostable(
      staff,
      idsByRefKind(allRefs, "lead")
    ))
  ) {
    return NextResponse.json({ error: "lead_mention_forbidden" }, { status: 403 });
  }
  if (
    !(await assertFacilityIdsPostable(
      staff,
      idsByRefKind(allRefs, "facility")
    ))
  ) {
    return NextResponse.json({ error: "facility_mention_forbidden" }, { status: 403 });
  }
  if (
    !(await assertEmployeeUserIdsPostable(
      staff,
      idsByRefKind(allRefs, "employee")
    ))
  ) {
    return NextResponse.json({ error: "employee_mention_forbidden" }, { status: 403 });
  }
  if (
    !(await assertRecruitApplicantIdsPostable(
      staff,
      idsByRefKind(allRefs, "recruit")
    ))
  ) {
    return NextResponse.json({ error: "recruit_mention_forbidden" }, { status: 403 });
  }

  if (mentionUserIds.length > 0) {
    const { data: mems } = await supabaseAdmin
      .from("internal_chat_members")
      .select("user_id")
      .eq("chat_id", cid)
      .in("user_id", mentionUserIds);
    const ok = new Set((mems ?? []).map((m) => String(m.user_id)));
    for (const id of mentionUserIds) {
      if (!ok.has(id)) {
        return NextResponse.json({ error: "invalid_mention" }, { status: 400 });
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
  const plain =
    canonical.trim() ||
    (attachmentName
      ? `📎 ${attachmentName}`
      : attachmentPath
        ? "Attachment"
        : allRefs.length
          ? "Reference"
          : " ");
  const { ciphertext, nonce } = encryptInternalChatUtf8(plain);

  const insertRow: Record<string, unknown> = {
    chat_id: cid,
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
    console.warn("[internal-chat/messages POST]", insErr?.message);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await insertAuditLogTrusted({
    action: "internal_chat_message_sent",
    entityType: "internal_chat",
    entityId: cid,
    metadata: {
      message_id: inserted.id,
      body_length: plain.length,
      has_attachment: Boolean(attachmentPath),
      reference_mention_count: allRefs.length,
    },
  });

  void notifyInternalChatRecipients({ chatId: cid, senderUserId: staff.user_id });

  return NextResponse.json({ ok: true, messageId: inserted.id });
}
