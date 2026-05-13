import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { W9_PERJURY_CERTIFICATION_BLOCK } from "@/lib/pdf-sign/constants";
import {
  finalizeRecipientSigning,
  loadRecipientContextByTokenHash,
  markRecipientViewed,
  saveRecipientFieldDraft,
} from "@/lib/pdf-sign/complete-recipient-signing";
import { fieldTypeTreatAsText, signerPartyFromField } from "@/lib/pdf-sign/normalize";
import { hashSignToken } from "@/lib/pdf-sign/token";

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await context.params;
  const token = decodeURIComponent(raw ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const hash = hashSignToken(token);
  const loaded = await loadRecipientContextByTokenHash(hash);
  if (!loaded) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  }
  await markRecipientViewed(hash);
  const { recipient, packet, packetDocument, template, fields } = loaded;
  if (packet.voided_at) {
    return NextResponse.json({ error: "This request was voided." }, { status: 410 });
  }
  if (new Date(recipient.token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  const { data: values } = await supabaseAdmin
    .from("signature_field_values")
    .select("template_field_id, text_value, bool_value")
    .eq("recipient_id", recipient.id)
    .eq("packet_document_id", packetDocument.id);

  const { data: sens } = await supabaseAdmin
    .from("sensitive_document_values")
    .select("field_key, last4")
    .eq("recipient_id", recipient.id)
    .eq("packet_document_id", packetDocument.id);

  const sensByKey = new Map((sens ?? []).map((r) => [r.field_key, r.last4]));
  const valueByFieldId = new Map((values ?? []).map((r) => [r.template_field_id, r]));

  const signerFields = fields.filter((f) => signerPartyFromField(f) === "recipient");

  const canvasFields = fields.map((f) => ({
    id: f.id,
    field_key: f.field_key,
    label: f.label ?? "",
    field_type: f.field_type,
    signer_role: f.signer_role,
    required: f.required,
    options: f.options,
    page_index: typeof f.page_index === "number" ? f.page_index : 0,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    font_size: f.font_size ?? 10,
    required_order: f.required_order ?? 0,
  }));

  const fieldPayload = signerFields.map((f) => {
    const stored = valueByFieldId.get(f.id);
    let value: string | boolean | null =
      f.field_type === "checkbox"
        ? stored?.bool_value === true || stored?.text_value === "true"
        : (stored?.text_value ?? null);
    if (f.field_type === "tin") {
      const last4 = sensByKey.get(f.field_key);
      value = last4 ? `***-**-${last4}` : "";
    }
    const clientFieldType = fieldTypeTreatAsText(f.field_type) ? "text" : f.field_type;
    return {
      fieldKey: f.field_key,
      label: f.label,
      fieldType: clientFieldType,
      optional: Boolean(
        f.options && typeof f.options === "object" && (f.options as { optional?: boolean }).optional
      ),
      value,
      order: f.required_order,
    };
  });

  const templateName = (template.name ?? "").trim();
  const documentTitle =
    template.document_type === "w9"
      ? "IRS Form W-9"
      : template.document_type === "i9"
        ? "Form I-9"
        : templateName || "Agreement";

  const bucket = packetDocument.completed_storage_bucket?.trim();
  const path = packetDocument.completed_storage_path?.trim();

  const hasCompletedPdf = Boolean(bucket && path && recipient.signed_at);

  return NextResponse.json({
    documentTitle,
    documentType: template.document_type,
    packetStatus: packet.status,
    recipientEmail: recipient.email,
    recipientDisplayName: recipient.display_name,
    signedAt: recipient.signed_at,
    hasCompletedPdf,
    fields: fieldPayload,
    canvasFields,
    w9CertificationText: template.document_type === "w9" ? W9_PERJURY_CERTIFICATION_BLOCK : null,
    i9Section: packet.i9_section,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token: raw } = await context.params;
  const token = decodeURIComponent(raw ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const hash = hashSignToken(token);
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  let body: {
    values?: Record<string, string | boolean>;
    finalize?: boolean;
    recipientSignatureImages?: Record<string, string>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const values = body.values && typeof body.values === "object" ? body.values : {};
  const finalize = body.finalize === true;

  let recipientSignatureImages: Record<string, string> | undefined;
  if (finalize && body.recipientSignatureImages && typeof body.recipientSignatureImages === "object") {
    recipientSignatureImages = Object.fromEntries(
      Object.entries(body.recipientSignatureImages).filter(([, v]) => typeof v === "string")
    );
  }

  if (!finalize) {
    const draft = await saveRecipientFieldDraft({
      tokenHash: hash,
      values,
      ipAddress: ip,
      userAgent,
    });
    if (!draft.ok) {
      return NextResponse.json({ error: draft.error }, { status: draft.status });
    }
    return NextResponse.json({ ok: true });
  }

  const done = await finalizeRecipientSigning({
    rawToken: token,
    values,
    recipientSignatureImages,
    ipAddress: ip,
    userAgent,
  });
  if (!done.ok) {
    return NextResponse.json({ error: done.error }, { status: done.status });
  }
  return NextResponse.json({ ok: true });
}
