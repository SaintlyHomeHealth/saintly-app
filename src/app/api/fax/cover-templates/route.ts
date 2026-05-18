import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  clearDefaultCoverTemplate,
  createUniqueTemplateSlug,
  listFaxCoverTemplates,
  missingFaxCoverTemplateSchema,
} from "@/lib/fax/fax-cover-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const templates = await listFaxCoverTemplates();
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load templates.";
    if (missingFaxCoverTemplateSchema(err instanceof Error ? { message } : null)) {
      return NextResponse.json({ ok: true, templates: [], schema_missing: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = textOrNull(body.name);
  if (!name) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }

  const slug = await createUniqueTemplateSlug(name);
  const makeDefault = Boolean(body.is_default);
  if (makeDefault) {
    await clearDefaultCoverTemplate();
  }
  const { data, error } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .insert({
      name,
      slug,
      default_subject: textOrNull(body.default_subject) ?? name,
      default_message: textOrNull(body.default_message) ?? "",
      is_default: makeDefault,
      is_system: false,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 100,
      created_by_user_id: staff.user_id,
    })
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
