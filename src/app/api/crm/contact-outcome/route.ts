import { NextResponse } from "next/server";

import { saveLeadOutcomeCore, type SaveLeadOutcomeResult } from "@/app/admin/crm/actions";
import { normalizeLeadNextActionInput } from "@/lib/crm/lead-follow-up-options";

function parseIsoInstant(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNextStep(
  v: unknown
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (v == null || v === "") return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, message: "next_step must be a string or null." };
  return normalizeLeadNextActionInput(v);
}

function httpStatusForResult(result: SaveLeadOutcomeResult): number {
  if (result.ok) return 200;
  switch (result.error) {
    case "forbidden":
      return 403;
    case "invalid_lead":
      return 404;
    case "save_failed":
      return 500;
    default:
      return 400;
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_outcome",
        message: "Invalid JSON body.",
      } satisfies Extract<SaveLeadOutcomeResult, { ok: false }>,
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_lead",
        message: "Expected a JSON object.",
      } satisfies Extract<SaveLeadOutcomeResult, { ok: false }>,
      { status: 400 }
    );
  }

  const b = body as Record<string, unknown>;
  const leadId = typeof b.lead_id === "string" ? b.lead_id.trim() : "";
  if (!leadId) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_lead",
        message: "Missing lead id.",
      } satisfies Extract<SaveLeadOutcomeResult, { ok: false }>,
      { status: 400 }
    );
  }

  const outcome = typeof b.contact_result === "string" ? b.contact_result.trim() : "";

  const rawActions = b.attempted_actions;
  const actionKeys = Array.isArray(rawActions)
    ? rawActions.map((x) => (typeof x === "string" ? x : String(x)))
    : [];

  const attemptAt = parseIsoInstant(b.attempt_at) ?? new Date();
  const followUpAt = parseIsoInstant(b.follow_up_at);

  const nextParsed = parseNextStep(b.next_step);
  if (!nextParsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_outcome",
        message: nextParsed.message,
      } satisfies Extract<SaveLeadOutcomeResult, { ok: false }>,
      { status: 400 }
    );
  }

  const notesRaw = b.outcome_note;
  const notes = typeof notesRaw === "string" ? notesRaw.trim().slice(0, 4000) : "";

  let leadTemperature: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(b, "lead_temperature")) {
    const lt = b.lead_temperature;
    if (lt === null || lt === "") {
      leadTemperature = null;
    } else if (typeof lt === "string") {
      leadTemperature = lt.trim();
    }
  }

  const result = await saveLeadOutcomeCore({
    leadId,
    outcome,
    actionKeys,
    attemptAt,
    followUpAt,
    nextAction: nextParsed.value,
    notes,
    leadTemperature,
  });

  return NextResponse.json(result, { status: httpStatusForResult(result) });
}
