import { NextResponse, type NextRequest } from "next/server";

import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { assertInternalChatMember, canPostToInternalChat } from "@/lib/internal-chat/access";
import {
  insertInternalChatComposerMessage,
  type ComposerMessageBodyJson,
} from "@/lib/internal-chat/composer-message-insert";
import { decryptInternalChatUtf8 } from "@/lib/internal-chat/crypto";
import type { InternalChatRefKind } from "@/lib/internal-chat/internal-chat-ref-kinds";
import { mapSupabaseNestedChatAttachments } from "@/lib/internal-chat/map-chat-message-attachments";
import {
  extractReferenceTokensFromCanonical,
  internalChatBodyForDisplay,
} from "@/lib/internal-chat/mention-tokens";
import {
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
      "id, chat_id, sender_id, created_at, ciphertext, nonce, attachment_path, attachment_mime, attachment_name, mention_user_ids, mention_patient_ids, chat_message_attachments ( id, file_name, content_type, size_bytes )"
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
    attachments: ReturnType<typeof mapSupabaseNestedChatAttachments>;
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
    const nestedAtt = (m as { chat_message_attachments?: unknown }).chat_message_attachments;
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
      attachments: mapSupabaseNestedChatAttachments(nestedAtt),
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
      attachments: d.attachments,
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

  let bodyJson: ComposerMessageBodyJson;
  try {
    bodyJson = (await req.json()) as ComposerMessageBodyJson;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const inserted = await insertInternalChatComposerMessage(staff, cid, bodyJson);
  if (!inserted.ok) {
    return NextResponse.json({ error: inserted.error }, { status: inserted.status });
  }

  return NextResponse.json({ ok: true, messageId: inserted.messageId });
}
