import "server-only";

import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { parseOpenAiJsonContent } from "@/lib/phone/phone-call-ai-context";
import { getCrmCalendarTodayIso, getCrmCalendarTomorrowIso } from "@/lib/crm/crm-local-date";
import { buildPhoenixRelativeDateHintsForVoiceTasks } from "@/lib/crm/phoenix-relative-date-hints";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";
import type { CrmTaskPriority, CrmTaskRelatedType } from "@/lib/crm/crm-task-types";
import type {
  VoiceExtractedTask,
  VoiceTaskExtractionContext,
  VoiceTaskExtractionResult,
} from "@/lib/crm/crm-voice-task-types";

export type {
  VoiceExtractedTask,
  VoiceTaskExtractionContext,
  VoiceTaskExtractionResult,
} from "@/lib/crm/crm-voice-task-types";

function isPriority(v: unknown): v is CrmTaskPriority {
  return v === "low" || v === "normal" || v === "high" || v === "urgent";
}

function isRelatedType(v: unknown): v is CrmTaskRelatedType {
  return (
    v === "lead" ||
    v === "recruit" ||
    v === "employee" ||
    v === "facility" ||
    v === "patient" ||
    v === "insurance_payer" ||
    v === "general"
  );
}

function normalizeExtraction(raw: unknown, ctx: VoiceTaskExtractionContext): VoiceTaskExtractionResult {
  const warnings: string[] = [];
  const tasks: VoiceExtractedTask[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { tasks: [], warnings: ["Model returned an unexpected shape."] };
  }
  const w = (raw as { warnings?: unknown }).warnings;
  if (Array.isArray(w)) {
    for (const x of w) {
      if (typeof x === "string" && x.trim()) warnings.push(x.trim());
    }
  }
  const list = (raw as { tasks?: unknown }).tasks;
  if (!Array.isArray(list)) {
    return { tasks: [], warnings: warnings.length ? warnings : ["No tasks array in model output."] };
  }
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    let priority: CrmTaskPriority = "normal";
    if (isPriority(o.priority)) priority = o.priority;
    let dueAt: string | null = null;
    if (typeof o.due_at === "string" && o.due_at.trim()) {
      const d = new Date(o.due_at.trim());
      if (!Number.isNaN(d.getTime())) {
        dueAt = d.toISOString();
      }
    }
    let relType: CrmTaskRelatedType | null = ctx.related_entity_type;
    let relId: string | null = ctx.related_entity_id;
    if (o.related_entity_type != null && o.related_entity_type !== "") {
      if (isRelatedType(o.related_entity_type)) {
        relType = o.related_entity_type;
      } else {
        warnings.push(`Ignored unknown related_entity_type from model for task “${title.slice(0, 40)}”.`);
      }
    }
    if (typeof o.related_entity_id === "string" && o.related_entity_id.trim()) {
      relId = o.related_entity_id.trim();
    }
    const desc =
      typeof o.description === "string" && o.description.trim() !== "" ? o.description.trim() : null;
    const confRaw = o.confidence;
    const confidence =
      typeof confRaw === "number" && Number.isFinite(confRaw)
        ? Math.min(1, Math.max(0, confRaw))
        : 0.5;
    tasks.push({
      title: title.slice(0, 500),
      description: desc,
      due_at: dueAt,
      priority,
      related_entity_type: relType,
      related_entity_id: relId,
      confidence,
    });
  }
  return { tasks, warnings };
}

const SYSTEM = `You are extracting CRM task records from a voice transcript for Saintly Home Health staff.
Output strict JSON only (no markdown).

Timezone for interpreting relative dates: America/Phoenix (MST, no DST).
The user message JSON includes transcript; phoenix_today_iso / phoenix_tomorrow_iso; phoenix_calendar_hints (weekday scaffolding + canonical Phoenix clock examples — use alongside your reasoning); defaults for related_entity when recording from CRM (may be null).

Rules:
- All relative wording (“tomorrow morning”, “today at 3”, “Friday”, “next Monday”) is interpreted using America/Phoenix wall time. Prefer the companion JSON hints (computed server-side).
- When a calendar day is implied but NO clock time is spoken, anchor due_at at 09:00 America/Phoenix (not midnight UTC, not accidental end-of-day) unless phrases like “afternoon/evening/3pm/night” warrant a later default (afternoon≈14:00). “Morning” ⇒ ~09:00.
- “Today at three / 3” with no AM/PM on a weekday usually means 15:00 (3 PM) Phoenix.
- If no due date is mentioned at all, due_at must be null.
- If no priority is mentioned, use "normal".
- Do not invent clinical facts, diagnoses, medications, or patient-specific medical details. If clinical detail is mentioned, put a short operational summary in the title/description and add a warning that clinical details were omitted.
- Keep titles short and operational; put detail in description.
- If ambiguous, lower confidence and add a warning rather than guessing.
- related_entity_type must be one of: lead, recruit, employee, facility, patient, insurance_payer, general — or align with the provided defaults when appropriate.

JSON shape:
{
  "tasks": [
    {
      "title": "string",
      "description": "string or null",
      "due_at": "ISO 8601 UTC string or null",
      "priority": "low" | "normal" | "high" | "urgent",
      "related_entity_type": "lead" | "recruit" | "employee" | "facility" | "patient" | "insurance_payer" | "general" | null,
      "related_entity_id": "uuid string or null",
      "confidence": 0.0-1.0
    }
  ],
  "warnings": ["string"]
}`;

export async function extractCrmTasksFromTranscript(
  transcript: string,
  ctx: VoiceTaskExtractionContext
): Promise<VoiceTaskExtractionResult> {
  const hints = buildPhoenixRelativeDateHintsForVoiceTasks();
  const userBlock = {
    transcript: transcript.trim(),
    phoenix_today_iso: ctx.phoenix_today_iso,
    phoenix_tomorrow_iso: ctx.phoenix_tomorrow_iso,
    phoenix_calendar_hints: hints,
    default_related_entity_type: ctx.related_entity_type,
    default_related_entity_id: ctx.related_entity_id,
  };
  const model = saintlyCrmTaskExtractionModel();
  const parsed = await fetchCrmOpenAiJsonObject(model, SYSTEM, JSON.stringify(userBlock));
  if (parsed == null) {
    return {
      tasks: [],
      warnings: ["Could not extract tasks (missing OPENAI_API_KEY, quota issue, or parse error)."],
    };
  }
  return normalizeExtraction(parsed, ctx);
}

/** Re-parse already-extracted JSON (e.g. tests). */
export function parseVoiceTaskExtractionJson(
  jsonStr: string,
  ctx: VoiceTaskExtractionContext
): VoiceTaskExtractionResult {
  const raw = parseOpenAiJsonContent(jsonStr);
  return normalizeExtraction(raw, {
    ...ctx,
    phoenix_today_iso: ctx.phoenix_today_iso || getCrmCalendarTodayIso(),
    phoenix_tomorrow_iso: ctx.phoenix_tomorrow_iso || getCrmCalendarTomorrowIso(),
  });
}

export function defaultVoiceTaskExtractionContext(partial?: Partial<VoiceTaskExtractionContext>): VoiceTaskExtractionContext {
  return {
    related_entity_type: partial?.related_entity_type ?? null,
    related_entity_id: partial?.related_entity_id ?? null,
    phoenix_today_iso: partial?.phoenix_today_iso ?? getCrmCalendarTodayIso(),
    phoenix_tomorrow_iso: partial?.phoenix_tomorrow_iso ?? getCrmCalendarTomorrowIso(),
  };
}
