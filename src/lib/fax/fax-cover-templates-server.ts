import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import type { FaxCoverSheetTemplateRow } from "@/lib/fax/fax-cover-template-types";

export function missingFaxCoverTemplateSchema(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (isMissingSchemaObjectError(error)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("fax_cover_sheet_templates");
}

export async function listFaxCoverTemplates(): Promise<FaxCoverSheetTemplateRow[]> {
  const { data, error } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FaxCoverSheetTemplateRow[];
}

export async function getFaxCoverTemplateById(id: string): Promise<FaxCoverSheetTemplateRow | null> {
  const { data, error } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as FaxCoverSheetTemplateRow | null) ?? null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "template";
}

export async function createUniqueTemplateSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabaseAdmin.from("fax_cover_sheet_templates").select("id").eq("slug", slug).maybeSingle();
    if (!data?.id) return slug;
  }
  return `${base}-${Date.now()}`;
}

export async function clearDefaultCoverTemplate(): Promise<void> {
  await supabaseAdmin.from("fax_cover_sheet_templates").update({ is_default: false }).eq("is_default", true);
}

export async function setDefaultCoverTemplate(templateId: string): Promise<void> {
  await clearDefaultCoverTemplate();
  const { error } = await supabaseAdmin
    .from("fax_cover_sheet_templates")
    .update({ is_default: true })
    .eq("id", templateId);
  if (error) throw error;
}

export { slugify };
