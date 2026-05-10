import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const ALLOWED_DOC_TYPES = new Set(["generic_contract", "w9", "i9"]);
const ALLOWED_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "date",
  "checkbox",
  "signature",
  "tin",
  "select",
]);

type FieldPayload = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  pdf_acroform_field_name?: string | null;
  prefill_value?: string | null;
  required?: boolean;
  page_index: number;
  page_width: number;
  page_height: number;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  options?: Record<string, unknown>;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await context.params;
  if (!templateId) {
    return NextResponse.json({ error: "Missing template id." }, { status: 400 });
  }

  const { data: tpl, error: tErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id, name, document_type, description, is_active, storage_bucket, storage_object_path")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr || !tpl) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const { data: fieldRows, error: fErr } = await supabaseAdmin
    .from("signature_template_fields")
    .select(
      "id, field_key, label, field_type, pdf_acroform_field_name, page_index, x, y, width, height, font_size, required_order, options"
    )
    .eq("template_id", templateId)
    .order("required_order", { ascending: true });
  if (fErr) {
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  let pdfUrl: string | null = null;
  if (tpl.storage_bucket && tpl.storage_object_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from(tpl.storage_bucket)
      .createSignedUrl(tpl.storage_object_path, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const fields = (fieldRows || []).map((r) => {
    const opts = (r.options || {}) as Record<string, unknown>;
    const optional = opts.optional === true;
    return {
      id: r.id,
      field_key: r.field_key,
      label: r.label,
      field_type: r.field_type,
      signer_role:
        typeof opts.signer_role === "string"
          ? opts.signer_role
          : ("recipient" as string),
      required: !optional,
      required_order: r.required_order ?? 0,
      page_index: r.page_index ?? 0,
      page_width: typeof opts.page_width === "number" ? opts.page_width : null,
      page_height: typeof opts.page_height === "number" ? opts.page_height : null,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      font_size: r.font_size ?? 10,
      pdf_acroform_field_name: r.pdf_acroform_field_name,
      prefill_value:
        typeof opts.prefill_value === "string" ? opts.prefill_value : null,
      options: r.options as Record<string, unknown> | null,
    };
  });

  return NextResponse.json({
    template: {
      id: tpl.id,
      name: tpl.name,
      document_type: tpl.document_type,
      description: tpl.description,
      is_active: tpl.is_active,
    },
    fields,
    pdfUrl,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await context.params;
  if (!templateId) {
    return NextResponse.json({ error: "Missing template id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        document_type?: string;
        description?: string | null;
        fields?: FieldPayload[];
      }
    | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { data: existingTpl, error: exErr } = await supabaseAdmin
    .from("signature_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();
  if (exErr || !existingTpl) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";
  const description =
    typeof body.description === "string"
      ? body.description.trim() || null
      : body.description === null
        ? null
        : undefined;

  if (!name || !documentType || !ALLOWED_DOC_TYPES.has(documentType)) {
    return NextResponse.json(
      { error: "Invalid name or document_type (use generic_contract, w9, or i9)." },
      { status: 400 }
    );
  }

  const fieldsIn = Array.isArray(body.fields) ? body.fields : null;
  if (!fieldsIn) {
    return NextResponse.json({ error: "fields array is required." }, { status: 400 });
  }

  const seenKeys = new Set<string>();
  for (const f of fieldsIn) {
    if (!f.field_key?.trim()) {
      return NextResponse.json({ error: "Each field needs a field_key." }, { status: 400 });
    }
    if (seenKeys.has(f.field_key)) {
      return NextResponse.json({ error: `Duplicate field key: ${f.field_key}` }, { status: 400 });
    }
    seenKeys.add(f.field_key);
    if (!ALLOWED_FIELD_TYPES.has(f.field_type)) {
      return NextResponse.json({ error: `Invalid field_type: ${f.field_type}` }, { status: 400 });
    }
  }

  const { error: updErr } = await supabaseAdmin
    .from("signature_templates")
    .update({
      name,
      document_type: documentType,
      ...(description !== undefined ? { description } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", templateId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { data: existingFields } = await supabaseAdmin
    .from("signature_template_fields")
    .select("id")
    .eq("template_id", templateId);

  const existingIds = new Set((existingFields || []).map((r) => r.id));
  const keepIds = new Set(fieldsIn.map((f) => f.id).filter(Boolean));

  const toRemove = [...existingIds].filter((id) => !keepIds.has(id));
  if (toRemove.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from("signature_template_fields")
      .delete()
      .eq("template_id", templateId)
      .in("id", toRemove);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  for (let i = 0; i < fieldsIn.length; i++) {
    const f = fieldsIn[i];
    const baseOptions = { ...(f.options || {}) };
    const required = f.required !== false;
    baseOptions.optional = !required;
    if (typeof baseOptions.signer_role !== "string") {
      baseOptions.signer_role = "recipient";
    }
    baseOptions.page_width = f.page_width;
    baseOptions.page_height = f.page_height;
    if (f.prefill_value != null) {
      baseOptions.prefill_value = f.prefill_value;
    }

    const row = {
      template_id: templateId,
      field_key: f.field_key.trim(),
      label: (f.label || "").trim() || f.field_key.trim(),
      field_type: f.field_type,
      pdf_acroform_field_name: f.pdf_acroform_field_name?.trim() || null,
      page_index: f.page_index,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      font_size: f.font_size,
      required_order: i,
      options: baseOptions,
    };

    if (existingIds.has(f.id)) {
      const { error: uErr } = await supabaseAdmin
        .from("signature_template_fields")
        .update(row)
        .eq("id", f.id)
        .eq("template_id", templateId);
      if (uErr) {
        return NextResponse.json({ error: uErr.message }, { status: 500 });
      }
    } else {
      const { error: iErr } = await supabaseAdmin.from("signature_template_fields").insert({
        id: f.id,
        ...row,
      });
      if (iErr) {
        return NextResponse.json({ error: iErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true, fieldCount: fieldsIn.length });
}
