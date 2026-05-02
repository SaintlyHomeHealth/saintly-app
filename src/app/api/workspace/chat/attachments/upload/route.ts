import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canPostToInternalChat } from "@/lib/internal-chat/access";
import { CHAT_ATTACHMENTS_BUCKET } from "@/lib/internal-chat/chat-attachments-bucket";
import {
  chatAttachmentDebugEnabled,
  isAllowedChatAttachmentContentType,
  maxBytesForChatAttachmentContentType,
} from "@/lib/internal-chat/chat-attachment-constants";
import {
  insertInternalChatComposerMessage,
  type ComposerMessageBodyJson,
} from "@/lib/internal-chat/composer-message-insert";
import { mapSafeChatContentTypeFromFile } from "@/lib/internal-chat/chat-upload-mime";
import { notifyInternalChatRecipients } from "@/lib/internal-chat/notify-members";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

function safeFilename(name: string): string {
  const base = name.replace(/[^\w.\-()+ ]/g, "_").trim() || "file";
  return base.slice(0, 120);
}

function logDebug(msg: string, detail?: Record<string, unknown>): void {
  if (!chatAttachmentDebugEnabled()) return;
  console.info(`[chat-attachments/upload] ${msg}`, detail ?? "");
}

export async function POST(req: NextRequest): Promise<Response> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const threadId = String(form.get("chat_thread_id") ?? "").trim();
  if (!threadId) {
    return NextResponse.json({ error: "invalid_thread" }, { status: 400 });
  }

  if (!(await canPostToInternalChat(threadId, staff.user_id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const metaRaw = form.get("meta");
  let meta: ComposerMessageBodyJson;
  try {
    if (typeof metaRaw === "string" && metaRaw.trim()) {
      meta = JSON.parse(metaRaw) as ComposerMessageBodyJson;
    } else {
      meta = { text: "" };
    }
  } catch {
    return NextResponse.json({ error: "invalid_meta" }, { status: 400 });
  }

  const files: File[] = [];
  for (const v of form.getAll("files")) {
    if (v instanceof File && v.size > 0) {
      files.push(v);
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }
  if (files.length > 12) {
    return NextResponse.json({ error: "too_many_files" }, { status: 400 });
  }

  const inserted = await insertInternalChatComposerMessage(staff, threadId, meta, {
    allowEmptyForFileUpload: true,
    plaintextCanonicalOnly: true,
    skipNotify: true,
  });

  if (!inserted.ok) {
    return NextResponse.json({ error: inserted.error }, { status: inserted.status });
  }

  const messageId = inserted.messageId;
  const uploadedPaths: string[] = [];
  const out: Array<{
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    viewUrl: string;
  }> = [];

  try {
    for (const file of files) {
      const contentType = mapSafeChatContentTypeFromFile(file);
      if (!contentType || !isAllowedChatAttachmentContentType(contentType)) {
        throw new Error("unsupported_type");
      }

      const maxB = maxBytesForChatAttachmentContentType(contentType);
      if (file.size > maxB) {
        throw new Error("too_large");
      }

      const attachmentId = randomUUID();
      const safe = safeFilename(file.name);
      const storagePath = `${threadId}/${messageId}/${attachmentId}-${safe}`;
      const buf = Buffer.from(await file.arrayBuffer());

      const { error: upErr } = await supabaseAdmin.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .upload(storagePath, buf, {
          cacheControl: "3600",
          upsert: false,
          contentType,
        });

      if (upErr) {
        logDebug("storage_upload_failed", { message: upErr.message });
        throw new Error("upload_failed");
      }
      uploadedPaths.push(storagePath);

      const { error: insErr } = await supabaseAdmin.from("chat_message_attachments").insert({
        id: attachmentId,
        chat_message_id: messageId,
        chat_thread_id: threadId,
        storage_bucket: CHAT_ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        file_name: file.name.slice(0, 200),
        content_type: contentType,
        size_bytes: file.size,
        created_by_user_id: staff.user_id,
      });

      if (insErr) {
        logDebug("row_insert_failed", { message: insErr.message });
        throw new Error("insert_failed");
      }

      logDebug("attachment_row_ok", {
        attachmentId,
        chat_message_id: messageId,
        chat_thread_id: threadId,
        storage_bucket: CHAT_ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        content_type: contentType,
        size_bytes: file.size,
      });

      out.push({
        id: attachmentId,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
        viewUrl: `/api/workspace/chat/attachments/${attachmentId}`,
      });
    }

    void notifyInternalChatRecipients({ chatId: threadId, senderUserId: staff.user_id });

    return NextResponse.json({
      ok: true,
      messageId,
      attachments: out,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg === "unsupported_type") {
      return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
    }
    if (msg === "too_large") {
      return NextResponse.json({ error: "too_large" }, { status: 400 });
    }

    await supabaseAdmin.from("chat_message_attachments").delete().eq("chat_message_id", messageId);
    for (const p of uploadedPaths) {
      await supabaseAdmin.storage.from(CHAT_ATTACHMENTS_BUCKET).remove([p]);
    }
    await supabaseAdmin.from("internal_chat_messages").delete().eq("id", messageId);

    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
