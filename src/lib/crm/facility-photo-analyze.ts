import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FACILITY_PHOTO_TYPES,
  isFacilityPhotoType,
  type FacilityPhotoType,
} from "@/lib/crm/facility-photos-constants";
import { createFacilityPhotoSignedUrl } from "@/lib/crm/facility-photo-upload";
import { similarFacilityNames } from "@/lib/crm/facility-match";
import { parseOpenAiJsonContent } from "@/lib/phone/phone-call-ai-context";

export type FacilityPhotoSourceContext =
  | "quick_log"
  | "ai_capture"
  | "facility_detail"
  | "route_builder"
  | "finder";

export type FacilityPhotoSuggestedActions = {
  materials_dropped_off: boolean;
  requested_packet: boolean;
  create_or_update_contact: boolean;
  contact_name: string | null;
  contact_role: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  attach_to_activity: boolean;
  attach_to_facility: boolean;
  got_business_card: boolean;
};

export type FacilityPhotoAnalysis = {
  photo_type: FacilityPhotoType;
  summary: string;
  suggested_actions: FacilityPhotoSuggestedActions;
  confidence: number;
  warnings: string[];
  possible_existing_contact_id: string | null;
  possible_existing_contact_name: string | null;
};

function buildVisionSystemPrompt(): string {
  return `You are a field sales assistant for Saintly Home Health. Analyze facility outreach photos and return ONLY valid JSON:
- photo_type: one of ${FACILITY_PHOTO_TYPES.join(", ")}
- summary: one sentence describing the image
- suggested_actions: object with:
  - materials_dropped_off: boolean (true for swag/postcards/materials left)
  - requested_packet: boolean (true for referral packet or fax request visible)
  - create_or_update_contact: boolean (true for business cards)
  - contact_name: string or null
  - contact_role: string or null
  - contact_phone: string or null
  - contact_email: string or null
  - attach_to_activity: boolean (usually true)
  - attach_to_facility: boolean (usually true)
  - got_business_card: boolean
- confidence: number 0-1
- warnings: string array

Be conservative. If unreadable, use photo_type "other", lower confidence, add warnings.`;
}

function normalizePhotoType(raw: unknown): FacilityPhotoType {
  const s = String(raw ?? "").trim().toLowerCase();
  if (isFacilityPhotoType(s)) return s;
  if (s.includes("business") && s.includes("card")) return "business_card";
  if (s.includes("postcard")) return "postcards";
  if (s.includes("swag")) return "swag_bag";
  if (s.includes("sign")) return "building_sign";
  if (s.includes("desk")) return "front_desk";
  if (s.includes("packet")) return "referral_packet";
  if (s.includes("fax")) return "fax_request";
  if (s.includes("document")) return "document";
  return "other";
}

function parseSuggestedActions(raw: unknown): FacilityPhotoSuggestedActions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    materials_dropped_off: Boolean(o.materials_dropped_off),
    requested_packet: Boolean(o.requested_packet),
    create_or_update_contact: Boolean(o.create_or_update_contact),
    contact_name: String(o.contact_name ?? "").trim() || null,
    contact_role: String(o.contact_role ?? "").trim() || null,
    contact_phone: String(o.contact_phone ?? "").trim() || null,
    contact_email: String(o.contact_email ?? "").trim() || null,
    attach_to_activity: o.attach_to_activity !== false,
    attach_to_facility: o.attach_to_facility !== false,
    got_business_card: Boolean(o.got_business_card),
  };
}

async function findPossibleExistingContact(
  supabase: SupabaseClient,
  facilityId: string,
  name: string | null,
  email: string | null,
  phone: string | null
): Promise<{ id: string; name: string } | null> {
  if (!name && !email && !phone) return null;

  const { data: rows } = await supabase
    .from("facility_contacts")
    .select("id, full_name, first_name, last_name, email, direct_phone, mobile_phone, title")
    .eq("facility_id", facilityId)
    .eq("is_active", true)
    .limit(100);

  const normEmail = (email ?? "").trim().toLowerCase();
  const normPhone = (phone ?? "").replace(/\D/g, "");

  for (const row of rows ?? []) {
    const c = row as {
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      direct_phone: string | null;
      mobile_phone: string | null;
    };
    const existingName =
      (c.full_name ?? "").trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim();

    if (normEmail && (c.email ?? "").trim().toLowerCase() === normEmail) {
      return { id: c.id, name: existingName || name || "Contact" };
    }

    if (normPhone.length >= 7) {
      const phones = [c.direct_phone, c.mobile_phone]
        .map((p) => (p ?? "").replace(/\D/g, ""))
        .filter(Boolean);
      if (phones.some((p) => p.endsWith(normPhone.slice(-7)) || normPhone.endsWith(p.slice(-7)))) {
        return { id: c.id, name: existingName || name || "Contact" };
      }
    }

    if (name && existingName && similarFacilityNames(existingName, name)) {
      return { id: c.id, name: existingName };
    }
  }

  return null;
}

export async function analyzeFacilityPhotosWithAi(
  supabase: SupabaseClient,
  input: {
    facility_id: string;
    photo_ids: string[];
    context_note?: string | null;
    source_context?: FacilityPhotoSourceContext;
  }
): Promise<{ ok: true; analysis: FacilityPhotoAnalysis } | { ok: false; error: string }> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "ai_not_configured" };
  }

  const photoIds = input.photo_ids.filter(Boolean);
  if (photoIds.length === 0) return { ok: false, error: "missing_photos" };

  const { data: photoRows } = await supabase
    .from("facility_activity_photos")
    .select("id, storage_path, mime_type, facility_id")
    .eq("facility_id", input.facility_id)
    .in("id", photoIds);

  if (!photoRows?.length) return { ok: false, error: "photos_not_found" };

  const imageParts: Array<{ type: "image_url"; image_url: { url: string; detail: "low" | "high" } }> = [];
  for (const row of photoRows) {
    const path = (row as { storage_path: string }).storage_path;
    const signed = await createFacilityPhotoSignedUrl(supabase, path, 600);
    if (!signed) continue;
    imageParts.push({
      type: "image_url",
      image_url: { url: signed, detail: "low" },
    });
  }

  if (imageParts.length === 0) return { ok: false, error: "signed_url_failed" };

  const model =
    process.env.SAINTLY_FACILITY_PHOTO_AI_MODEL?.trim() ||
    process.env.SAINTLY_FACILITY_AI_CAPTURE_MODEL?.trim() ||
    "gpt-4o-mini";

  const userText = [
    input.context_note?.trim() ? `Field note context: ${input.context_note.trim()}` : null,
    input.source_context ? `Source: ${input.source_context}` : null,
    "Classify the attached facility outreach photo(s).",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildVisionSystemPrompt() },
        {
          role: "user",
          content: [{ type: "text", text: userText }, ...imageParts],
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[facility-photo-ai] OpenAI HTTP:", res.status, t.slice(0, 240));
    return { ok: false, error: "ai_failed" };
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  const parsed = content ? parseOpenAiJsonContent(content) : null;
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "ai_failed" };

  const ai = parsed as Record<string, unknown>;
  const photo_type = normalizePhotoType(ai.photo_type);
  const suggested_actions = parseSuggestedActions(ai.suggested_actions);

  if (photo_type === "business_card") {
    suggested_actions.create_or_update_contact = true;
    suggested_actions.got_business_card = true;
  }
  if (photo_type === "postcards" || photo_type === "swag_bag") {
    suggested_actions.materials_dropped_off = true;
  }
  if (photo_type === "referral_packet" || photo_type === "fax_request") {
    suggested_actions.requested_packet = true;
  }

  const warnings = Array.isArray(ai.warnings)
    ? ai.warnings.filter((w): w is string => typeof w === "string")
    : [];

  const confidence =
    typeof ai.confidence === "number" && Number.isFinite(ai.confidence)
      ? Math.max(0, Math.min(1, ai.confidence))
      : 0.5;

  let possible_existing_contact_id: string | null = null;
  let possible_existing_contact_name: string | null = null;

  if (suggested_actions.create_or_update_contact) {
    const match = await findPossibleExistingContact(
      supabase,
      input.facility_id,
      suggested_actions.contact_name,
      suggested_actions.contact_email,
      suggested_actions.contact_phone
    );
    if (match) {
      possible_existing_contact_id = match.id;
      possible_existing_contact_name = match.name;
      warnings.push("Possible existing contact found.");
    }
  }

  return {
    ok: true,
    analysis: {
      photo_type,
      summary: String(ai.summary ?? "").trim() || "Facility outreach photo",
      suggested_actions,
      confidence,
      warnings,
      possible_existing_contact_id,
      possible_existing_contact_name,
    },
  };
}
