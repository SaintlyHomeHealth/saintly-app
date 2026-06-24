import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canViewPrivateBusinessEmail } from "@/lib/email-marketing/permissions";
import { requireEmailMarketingStaff } from "@/lib/email-marketing/require-email-marketing-staff";
import { sendThreadReply } from "@/lib/email-marketing/thread-reply";
import type { EmailSenderProfileRow, EmailThreadRow } from "@/lib/email-marketing/types";

export const runtime = "nodejs";

type ReplyBody = {
  body?: string;
  toEmails?: string[];
  senderProfileId?: string;
  customSenderName?: string;
  customSenderTitle?: string;
  customSenderPhone?: string;
  customSenderEmail?: string;
  flyerId?: string | null;
  attachFlyer?: boolean;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { threadId } = await ctx.params;
  if (!threadId) return NextResponse.json({ error: "Thread id required." }, { status: 400 });

  let body: ReplyBody;
  try {
    body = (await req.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { data: thread } = await supabaseAdmin.from("email_threads").select("*").eq("id", threadId).maybeSingle();
  if (!thread) return NextResponse.json({ error: "Thread not found." }, { status: 404 });

  const senderProfileId = (body.senderProfileId ?? "").trim();
  if (!senderProfileId) return NextResponse.json({ error: "Sender profile is required." }, { status: 400 });

  const { data: senderProfile } = await supabaseAdmin
    .from("email_sender_profiles")
    .select("*")
    .eq("id", senderProfileId)
    .eq("is_active", true)
    .maybeSingle();
  if (!senderProfile) return NextResponse.json({ error: "Sender profile not found." }, { status: 404 });

  let toEmails = (body.toEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!toEmails.length) {
    const { data: inbound } = await supabaseAdmin
      .from("email_messages")
      .select("from_email")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("gmail_internal_date", { ascending: false })
      .limit(1);
    const from = inbound?.[0]?.from_email?.trim().toLowerCase();
    if (from) toEmails = [from];
  }

  let flyer = null;
  if (body.flyerId) {
    const { data } = await supabaseAdmin
      .from("email_marketing_flyers")
      .select("*")
      .eq("id", body.flyerId)
      .eq("is_active", true)
      .maybeSingle();
    flyer = data;
  }

  const result = await sendThreadReply({
    thread: thread as EmailThreadRow,
    toEmails,
    body: body.body ?? "",
    senderProfile: senderProfile as EmailSenderProfileRow,
    customSender: {
      name: body.customSenderName,
      title: body.customSenderTitle,
      phone: body.customSenderPhone,
      email: body.customSenderEmail,
    },
    flyer,
    attachFlyer: body.attachFlyer === true,
    sentByUserId: gate.staff.user_id,
    showPrivateBusinessEmail: canViewPrivateBusinessEmail(gate.staff),
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, messageId: result.messageId, gmailMessageId: result.gmailMessageId });
}
