import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { missingFaxCoverTemplateSchema } from "@/lib/fax/fax-cover-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ templateId: string }> };

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const name = textOrNull(body.name);
  if (name) patch.name = name;
  if (body.default_subject !== undefined) patch.default_subject = textOrNull(body.default_subject) ?? "";
  if (body.default_message !== undefined) patch.default_message = textOrNull(body.default_message) ?? "";
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .update(patch)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) {
    if (missingFaxCoverTemplateSchema(error)) {
      return NextResponse.json({ error: "Fax cover template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;

  const { data: existing, error: loadError } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .select("id, is_system, is_default")
    .eq("id", templateId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing?.id) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (existing.is_system) {
    return NextResponse.json({ error: "Starter templates cannot be deleted." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("fax_cover_sheet_templates").delete().eq("id", templateId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existing.is_default) {
    const { data: fallback } = await supabaseAdmin
      .from("fax_cover_sheet_templates")
      .select("id")
      .eq("slug", "signed-485-plan-of-care")
      .maybeSingle();
    if (fallback?.id) {
      await supabaseAdmin.from("fax_cover_sheet_templates").update({ is_default: true }).eq("id", fallback.id);
    }
  }

  return NextResponse.json({ ok: true });
}
