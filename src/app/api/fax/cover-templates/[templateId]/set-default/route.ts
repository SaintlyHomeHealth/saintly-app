import { NextResponse } from "next/server";

import {
  getFaxCoverTemplateById,
  missingFaxCoverTemplateSchema,
  setDefaultCoverTemplate,
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
  const template = await getFaxCoverTemplateById(templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  try {
    await setDefaultCoverTemplate(templateId);
    return NextResponse.json({ ok: true, template: { ...template, is_default: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not set default.";
    if (missingFaxCoverTemplateSchema(err instanceof Error ? { message } : null)) {
      return NextResponse.json({ error: "Fax cover template migration not applied." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
