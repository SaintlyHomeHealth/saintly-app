import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { assertInternalChatMember } from "@/lib/internal-chat/access";
import { CHAT_ATTACHMENTS_BUCKET } from "@/lib/internal-chat/chat-attachments-bucket";
import { chatAttachmentDebugEnabled } from "@/lib/internal-chat/chat-attachment-constants";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

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

function postgrestErrorFields(err: { message?: string; code?: string; details?: string; hint?: string }) {
  return {
    message: err.message,
    code: err.code,
    details: err.details,
    hint: err.hint,
  };
}

const ATTACHMENT_SELECT =
  "id, storage_path, storage_bucket, content_type, chat_thread_id, chat_message_id, size_bytes, file_name";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ attachmentId: string }> }
): Promise<Response> {
  const debug = chatAttachmentDebugEnabled();

  const user = await getAuthenticatedUser();
  if (!user) {
    if (debug) {
      console.warn("[chat-attachments/view] unauthorized: no auth user");
    }
    return attachErrorResponse(req, 401, "unauthorized", "Sign in required.");
  }

  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    if (debug) {
      console.warn("[chat-attachments/view] forbidden: staff / workspace chat gate", {
        hasStaff: Boolean(staff),
        userId: user.id,
      });
    }
    return attachErrorResponse(
      req,
      403,
      "forbidden",
      "You do not have access to workspace chat attachments."
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
      authUserId: user.id,
      staffUserId: staff.user_id,
      staffRole: staff.role,
      isActive: staff.is_active,
    });
  }

  /** Compare RLS path vs service path (debug only). */
  if (debug) {
    try {
      const supabaseUser = await createServerSupabaseClient();
      const rlsTry = await supabaseUser
        .from("chat_message_attachments")
        .select("id")
        .eq("id", aid)
        .maybeSingle();

      if (rlsTry.error) {
        console.warn("[chat-attachments/view] rls_jwt_select_error", {
          attachmentId: aid,
          authUserId: user.id,
          ...postgrestErrorFields(rlsTry.error),
        });
      } else {
        console.info("[chat-attachments/view] rls_jwt_select_ok", {
          attachmentId: aid,
          rowReturned: Boolean(rlsTry.data),
        });
      }
    } catch (e) {
      console.warn("[chat-attachments/view] rls_probe_exception", {
        attachmentId: aid,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("chat_message_attachments")
    .select(ATTACHMENT_SELECT)
    .eq("id", aid)
    .maybeSingle();

  if (rowErr) {
    console.warn("[chat-attachments/view] admin_select_failed", {
      attachmentId: aid,
      authUserId: user.id,
      ...postgrestErrorFields(rowErr),
    });
    return attachErrorResponse(
      req,
      500,
      "query_failed",
      "Could not load attachment metadata."
    );
  }

  if (!row?.storage_path || !row?.storage_bucket) {
    if (debug) {
      console.warn("[chat-attachments/view] not_found_after_admin_select", {
        attachmentId: aid,
        rowPresent: Boolean(row),
      });
    }
    return attachErrorResponse(req, 404, "not_found", "Attachment not found.");
  }

  const member = await assertInternalChatMember(row.chat_thread_id, staff.user_id);
  const adminBypass = isAdminOrHigher(staff) && staff.is_active !== false;

  if (!member && !adminBypass) {
    if (debug) {
      console.warn("[chat-attachments/view] forbidden_not_thread_member", {
        attachmentId: aid,
        chatThreadId: row.chat_thread_id,
        userId: staff.user_id,
      });
    }
    return attachErrorResponse(
      req,
      403,
      "forbidden",
      "You do not have access to this attachment."
    );
  }

  const { data: msg, error: msgErr } = await supabaseAdmin
    .from("internal_chat_messages")
    .select("id, chat_id")
    .eq("id", row.chat_message_id)
    .maybeSingle();

  if (msgErr) {
    console.warn("[chat-attachments/view] message_lookup_failed", {
      attachmentId: aid,
      chatMessageId: row.chat_message_id,
      ...postgrestErrorFields(msgErr),
    });
    return attachErrorResponse(
      req,
      500,
      "message_lookup_failed",
      "Could not verify attachment message."
    );
  }

  if (!msg || String(msg.chat_id) !== String(row.chat_thread_id)) {
    if (debug) {
      console.warn("[chat-attachments/view] thread_message_mismatch", {
        attachmentId: aid,
        rowThreadId: row.chat_thread_id,
        messageId: row.chat_message_id,
        messageChatId: msg?.chat_id ?? null,
      });
    }
    return attachErrorResponse(
      req,
      404,
      "not_found",
      "Attachment is not linked to a valid chat message."
    );
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
    console.info("[chat-attachments/view] row_ok", {
      id: row.id,
      storage_bucket: bucket,
      storage_path: path,
      content_type: row.content_type,
      chat_thread_id: row.chat_thread_id,
      chat_message_id: row.chat_message_id,
      size_bytes: row.size_bytes,
      file_name: row.file_name,
      memberRole: member?.member_role ?? null,
      adminBypass,
    });
  }

  const { data, error: signErr } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 120);

  if (signErr || !data?.signedUrl) {
    console.warn("[chat-attachments/view] sign_failed", {
      attachmentId: aid,
      path,
      signMessage: signErr?.message,
    });
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
