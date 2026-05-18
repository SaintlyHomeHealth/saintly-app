import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  createUniqueTemplateSlug,
  getFaxCoverTemplateById,
  missingFaxCoverTemplateSchema,
} from "@/lib/fax/fax-cover-templates-server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ templateId: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await ctx.params;
  const source = await getFaxCoverTemplateById(templateId);
  if (!source) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const copyName = `${source.name} (copy)`;
  const slug = await createUniqueTemplateSlug(copyName);

  const { data, error } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .insert({
      name: copyName,
      slug,
      default_subject: source.default_subject,
      default_message: source.default_message,
      is_default: false,
      is_system: false,
      sort_order: source.sort_order + 1,
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
