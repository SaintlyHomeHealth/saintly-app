import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLogTrusted } from "@/lib/audit-log";
import { PDF_SIGN_BUCKETS } from "@/lib/pdf-sign/constants";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type FieldJson = {
  field_key: string;
  label: string;
  field_type: string;
  pdf_acroform_field_name?: string | null;
  page_index?: number;
  x?: number | null;
  y?: number | null;
  font_size?: number | null;
  required_order?: number;
  options?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  type ReadableFormData = { get(name: string): unknown };
  let multipart: ReadableFormData;
  try {
    multipart = (await request.formData()) as unknown as ReadableFormData;
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = multipart.get("file") as File | null;
  const name = multipart.get("name")?.toString().trim();
  const documentType = multipart.get("documentType")?.toString().trim() as
    | "generic_contract"
    | "w9"
    | "i9"
    | undefined;
  const description = multipart.get("description")?.toString().trim() || null;
  const fieldsRaw = multipart.get("fieldsJson")?.toString().trim() || "[]";

  if (!file || !name || !documentType) {
    return NextResponse.json({ error: "Missing file, name, or documentType." }, { status: 400 });
  }

  if (!["generic_contract", "w9", "i9"].includes(documentType)) {
    return NextResponse.json({ error: "Invalid documentType." }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF uploads are supported." }, { status: 400 });
  }

  let fields: FieldJson[];
  try {
    fields = JSON.parse(fieldsRaw) as FieldJson[];
    if (!Array.isArray(fields)) throw new Error("not array");
  } catch {
    return NextResponse.json({ error: "Invalid fieldsJson." }, { status: 400 });
  }

  const templateId = randomUUID();
  const path = `templates/${templateId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage.from(PDF_SIGN_BUCKETS.templates).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: tpl, error: insErr } = await supabaseAdmin
    .from("signature_templates")
    .insert({
      id: templateId,
      document_type: documentType,
      name,
      description,
      storage_bucket: PDF_SIGN_BUCKETS.templates,
      storage_object_path: path,
      version: 1,
      is_active: true,
      created_by_staff_user_id: user.id,
    })
    .select("id")
    .single();

  if (insErr || !tpl?.id) {
    await supabaseAdmin.storage.from(PDF_SIGN_BUCKETS.templates).remove([path]);
    return NextResponse.json({ error: insErr?.message || "Insert failed." }, { status: 500 });
  }

  if (fields.length > 0) {
    const rows = fields.map((f, i) => ({
      template_id: tpl.id,
      field_key: f.field_key.trim(),
      label: f.label.trim(),
      field_type: f.field_type.trim(),
      pdf_acroform_field_name: f.pdf_acroform_field_name?.trim() || null,
      page_index: typeof f.page_index === "number" ? f.page_index : 0,
      x: f.x ?? null,
      y: f.y ?? null,
      font_size: typeof f.font_size === "number" ? f.font_size : 10,
      required_order: typeof f.required_order === "number" ? f.required_order : i,
      options: f.options ?? {},
    }));

    const allowedFt = new Set(["text", "textarea", "date", "checkbox", "signature", "tin", "select"]);
    for (const r of rows) {
      if (!r.field_key || !r.label || !allowedFt.has(r.field_type)) {
        await supabaseAdmin.from("signature_templates").delete().eq("id", tpl.id);
        await supabaseAdmin.storage.from(PDF_SIGN_BUCKETS.templates).remove([path]);
        return NextResponse.json({ error: "Invalid field row." }, { status: 400 });
      }
    }

    const { error: fErr } = await supabaseAdmin.from("signature_template_fields").insert(rows);
    if (fErr) {
      await supabaseAdmin.from("signature_templates").delete().eq("id", tpl.id);
      await supabaseAdmin.storage.from(PDF_SIGN_BUCKETS.templates).remove([path]);
      return NextResponse.json({ error: fErr.message }, { status: 500 });
    }
  }

  await insertAuditLogTrusted({
    action: "pdf_sign_template_uploaded",
    entityType: "signature_template",
    entityId: tpl.id,
    metadata: { document_type: documentType, name },
  });

  return NextResponse.json({ ok: true, templateId: tpl.id });
}
