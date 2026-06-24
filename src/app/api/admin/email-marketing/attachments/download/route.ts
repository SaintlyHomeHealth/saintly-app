import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { fetchGmailAttachment } from "@/lib/email-marketing/gmail/send";
import { EMAIL_INBOX_ATTACHMENTS_BUCKET } from "@/lib/email-marketing/types";
import { requireEmailMarketingStaff } from "@/lib/email-marketing/require-email-marketing-staff";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const attachmentId = req.nextUrl.searchParams.get("id")?.trim();
  if (!attachmentId) return NextResponse.json({ error: "Attachment id required." }, { status: 400 });

  const { data: att } = await supabaseAdmin
    .from("email_attachments")
    .select("*, email_messages(gmail_message_id)")
    .eq("id", attachmentId)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

  if (att.storage_path) {
    const { data, error } = await supabaseAdmin.storage
      .from(EMAIL_INBOX_ATTACHMENTS_BUCKET)
      .createSignedUrl(att.storage_path, 3600);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || "Could not sign URL." }, { status: 500 });
    }
    return NextResponse.redirect(data.signedUrl);
  }

  const gmailMessageId = (att.email_messages as { gmail_message_id?: string } | null)?.gmail_message_id;
  const gmailAttachmentId = att.gmail_attachment_id;
  if (!gmailMessageId || !gmailAttachmentId) {
    return NextResponse.json({ error: "Attachment is not available yet." }, { status: 404 });
  }

  const fetched = await fetchGmailAttachment({ gmailMessageId, gmailAttachmentId });
  if (!fetched) return NextResponse.json({ error: "Could not fetch attachment from Gmail." }, { status: 502 });

  const storagePath = `${attachmentId}/${att.file_name}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(EMAIL_INBOX_ATTACHMENTS_BUCKET)
    .upload(storagePath, fetched.data, { contentType: att.mime_type, upsert: true });
  if (uploadError) {
    return new NextResponse(fetched.data, {
      headers: {
        "Content-Type": att.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${att.file_name}"`,
      },
    });
  }

  await supabaseAdmin
    .from("email_attachments")
    .update({ storage_path: storagePath, size_bytes: fetched.size })
    .eq("id", attachmentId);

  const { data: signed } = await supabaseAdmin.storage
    .from(EMAIL_INBOX_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (!signed?.signedUrl) {
    return new NextResponse(fetched.data, {
      headers: {
        "Content-Type": att.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${att.file_name}"`,
      },
    });
  }
  return NextResponse.redirect(signed.signedUrl);
}
