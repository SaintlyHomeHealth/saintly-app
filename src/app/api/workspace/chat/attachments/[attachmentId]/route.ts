import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { CHAT_ATTACHMENTS_BUCKET } from "@/lib/internal-chat/chat-attachments-bucket";
import { chatAttachmentDebugEnabled } from "@/lib/internal-chat/chat-attachment-constants";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function wantsHtml(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

function attachErrorResponse(req: Request, status: number, code: string, message: string): Response {
  if (wantsHtml(req)) {
    const safe = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const body = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Attachment</title></head><body style="font-family:system-ui,sans-serif;padding:1.5rem;max-width:32rem"><p style="font-weight:600">Attachment unavailable</p><p style="color:#444">${safe}</p><p style="font-size:0.85rem;color:#666">Code: ${code}</p></body></html>`;
    return new NextResponse(body, {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.json({ error: code, message }, { status });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  const debug = chatAttachmentDebugEnabled();

  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    if (debug) {
      console.warn("[chat-attachments/view] forbidden: no staff / workspace chat access", {
        hasStaff: Boolean(staff),
      });
    }
    return attachErrorResponse(
      req,
      403,
      "forbidden",
      "You do not have access to this attachment."
    );
  }

  const { attachmentId } = await ctx.params;
  const aid = (attachmentId ?? "").trim().toLowerCase();
  if (!aid || !UUID_RE.test(aid)) {
    return attachErrorResponse(req, 400, "invalid", "Invalid attachment id.");
  }

  if (debug) {
    console.info("[chat-attachments/view] request", {
      attachmentId: aid,
      userId: staff.user_id,
    });
  }

  const supabaseUser = await createServerSupabaseClient();
  const { data: row, error } = await supabaseUser
    .from("chat_message_attachments")
    .select(
      "id, storage_path, storage_bucket, content_type, chat_thread_id, chat_message_id, size_bytes, file_name"
    )
    .eq("id", aid)
    .maybeSingle();

  if (error) {
    if (debug) {
      console.warn("[chat-attachments/view] select error", {
        attachmentId: aid,
        message: error.message,
        code: error.code,
      });
    }
    return attachErrorResponse(
      req,
      500,
      "query_failed",
      "Could not load attachment metadata."
    );
  }

  if (!row?.storage_path || !row?.storage_bucket) {
    if (debug) {
      console.warn("[chat-attachments/view] not_found", { attachmentId: aid, rowPresent: Boolean(row) });
    }
    return attachErrorResponse(req, 404, "not_found", "Attachment not found or access denied.");
  }

  const bucket = String(row.storage_bucket);
  if (bucket !== CHAT_ATTACHMENTS_BUCKET) {
    if (debug) {
      console.warn("[chat-attachments/view] wrong_bucket", { attachmentId: aid, bucket });
    }
    return attachErrorResponse(req, 403, "forbidden", "Invalid storage bucket for this attachment.");
  }

  const path = String(row.storage_path);

  if (debug) {
    console.info("[chat-attachments/view] row", {
      id: row.id,
      storage_bucket: bucket,
      storage_path: path,
      content_type: row.content_type,
      chat_thread_id: row.chat_thread_id,
      chat_message_id: row.chat_message_id,
      size_bytes: row.size_bytes,
      file_name: row.file_name,
    });
  }

  const { data, error: signErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 120);

  if (signErr || !data?.signedUrl) {
    console.warn("[chat-attachments/view] sign_failed:", signErr?.message, { attachmentId: aid, path });
    if (debug) {
      console.warn("[chat-attachments/view] sign detail", {
        attachmentId: aid,
        signErr: signErr?.message,
        hasUrl: Boolean(data?.signedUrl),
      });
    }
    return attachErrorResponse(
      req,
      500,
      "sign_failed",
      "Could not generate a temporary download link."
    );
  }

  if (debug) {
    console.info("[chat-attachments/view] signed_ok", {
      attachmentId: aid,
      signedUrlHost: (() => {
        try {
          return new URL(data.signedUrl).host;
        } catch {
          return "(parse error)";
        }
      })(),
    });
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
