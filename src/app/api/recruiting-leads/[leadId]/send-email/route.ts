import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import {
  insertRecruitingLeadActivity,
  RECRUITING_LEAD_ACTIVITY_EVENT,
} from "@/lib/recruiting/recruiting-lead-activities";
import {
  buildRecruitingEmailVariables,
  findUnresolvedRecruitingEmailPlaceholders,
  renderRecruitingEmailTemplate,
} from "@/lib/recruiting/render-recruiting-email-template";
import { prepareRecruitingEmailPayload } from "@/lib/recruiting/recruiting-email-signature";
import type { RecruitingEmailTemplateId } from "@/lib/recruiting/recruiting-email-templates";
import { sendRecruitingEmail } from "@/lib/recruiting/send-recruiting-email";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

type Body = {
  template_id?: string;
  subject?: string;
  body?: string;
  visit_rate?: string;
  soc_rate?: string;
  pay_summary?: string;
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ leadId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { leadId: rawLeadId } = await ctx.params;
  const leadId = rawLeadId?.trim();
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "missing_lead_id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const subjectRaw = typeof body.subject === "string" ? body.subject.trim() : "";
  const bodyRaw = typeof body.body === "string" ? body.body.trim() : "";
  const templateId = typeof body.template_id === "string" ? body.template_id.trim() : "";

  if (!subjectRaw || !bodyRaw) {
    return NextResponse.json({ ok: false, error: "subject_and_body_required" }, { status: 400 });
  }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select("id, full_name, phone, email, city, license_status, lead_type, form_name")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead?.id) {
    return NextResponse.json({ ok: false, error: "lead_not_found" }, { status: 404 });
  }

  const recipient = typeof lead.email === "string" ? lead.email.trim().toLowerCase() : "";
  if (!recipient || !recipient.includes("@")) {
    return NextResponse.json({ ok: false, error: "missing_lead_email" }, { status: 400 });
  }

  const variables = buildRecruitingEmailVariables(
    {
      full_name: String(lead.full_name ?? ""),
      phone: lead.phone,
      email: lead.email,
      license_status: lead.license_status,
      lead_type: lead.lead_type,
      form_name: lead.form_name,
    },
    {
      visit_rate: typeof body.visit_rate === "string" ? body.visit_rate : undefined,
      soc_rate: typeof body.soc_rate === "string" ? body.soc_rate : undefined,
      pay_summary: typeof body.pay_summary === "string" ? body.pay_summary : undefined,
      template_id: (templateId as RecruitingEmailTemplateId) || undefined,
    }
  );

  const subject = renderRecruitingEmailTemplate(subjectRaw, variables);
  const renderedBody = renderRecruitingEmailTemplate(bodyRaw, variables);

  const unresolved = [
    ...findUnresolvedRecruitingEmailPlaceholders(subject),
    ...findUnresolvedRecruitingEmailPlaceholders(renderedBody),
  ];
  if (unresolved.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Unresolved placeholders in email: ${unresolved.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const { text: sentBodyText } = prepareRecruitingEmailPayload(renderedBody);
  const sentAt = new Date().toISOString();
  const sentByName = staffPrimaryLabel(staff);

  const sendResult = await sendRecruitingEmail({
    to: recipient,
    subject,
    bodyText: renderedBody,
  });

  const baseMetadata = {
    template_id: templateId || null,
    subject,
    body: sentBodyText,
    recipient,
    sent_at: sentAt,
    sent_by: staff.user_id,
    sent_by_name: sentByName,
    delivery_status: sendResult.ok ? ("sent" as const) : sendResult.deliveryStatus,
    provider_message_id: sendResult.ok ? sendResult.providerMessageId : null,
    error: sendResult.ok ? null : sendResult.error,
  };

  const activity = await insertRecruitingLeadActivity(supabaseAdmin, {
    leadId,
    eventType: sendResult.ok
      ? RECRUITING_LEAD_ACTIVITY_EVENT.outbound_email
      : RECRUITING_LEAD_ACTIVITY_EVENT.outbound_email_failed,
    body: sendResult.ok
      ? `Email sent to ${recipient}\nSubject: ${subject}`
      : `Email failed to ${recipient}\nSubject: ${subject}\nError: ${sendResult.error}`,
    metadata: baseMetadata,
    createdBy: staff.user_id,
  });

  if (!activity.ok) {
    console.warn("[recruiting-leads/send-email] activity log failed", activity.error);
  }

  revalidatePath(`/admin/recruiting-leads/${leadId}`);

  if (!sendResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: sendResult.error,
        delivery_status: sendResult.deliveryStatus,
        activity_logged: activity.ok,
      },
      { status: sendResult.deliveryStatus === "rejected" ? 422 : 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    delivery_status: "sent",
    provider_message_id: sendResult.providerMessageId,
    activity_id: activity.ok ? activity.id : null,
  });
}
