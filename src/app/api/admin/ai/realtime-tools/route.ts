import { NextResponse } from "next/server";

import { dispatchSaintlyRealtimeCrmTool, type SaintlyRealtimeToolContext } from "@/lib/crm/saintly-realtime-crm-tools";
import { isSaintlyRealtimeAiEnabledRuntime } from "@/lib/crm/saintly-ai-voice-config";
import { requireCrmTasksStaff } from "@/lib/crm/require-crm-tasks-staff";
import { getAuthenticatedUser } from "@/lib/supabase/server";

function decodeContextHeader(raw: string | null): SaintlyRealtimeToolContext {
  const empty: SaintlyRealtimeToolContext = {
    lead_id: null,
    recruit_id: null,
    employee_id: null,
    facility_id: null,
    patient_id: null,
    insurance_payer_id: null,
  };
  if (!raw?.trim()) return empty;
  try {
    const b = Buffer.from(raw.trim(), "base64url");
    const txt = b.toString("utf8").trim();
    const j = JSON.parse(txt) as Record<string, unknown>;
    function s(k: string): string | null {
      const v = j[k];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    }
    return {
      lead_id: s("lead_id"),
      recruit_id: s("recruit_id"),
      employee_id: s("employee_id"),
      facility_id: s("facility_id"),
      patient_id: s("patient_id"),
      insurance_payer_id: s("insurance_payer_id"),
    };
  } catch {
    return empty;
  }
}

/** Proxies Saintly CRM Realtime function calls server-side so tools never expose the secret API key. */
export async function POST(req: Request) {
  if (!isSaintlyRealtimeAiEnabledRuntime()) {
    return NextResponse.json({ error: "Realtime AI disabled" }, { status: 403 });
  }
  const gate = await requireCrmTasksStaff();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toolName = typeof body.tool_name === "string" ? body.tool_name.trim() : "";
  const rawArgumentsJson =
    typeof body.arguments === "string"
      ? body.arguments
      : typeof body.arguments_json === "string"
        ? body.arguments_json
        : "";
  if (!toolName || typeof rawArgumentsJson !== "string" || rawArgumentsJson.length === 0) {
    return NextResponse.json({ error: "Missing tool_name or arguments" }, { status: 400 });
  }

  const headerCtx = decodeContextHeader(req.headers.get("x-saintly-realtime-context"));
  const bodyCtxRaw = body.session_context && typeof body.session_context === "object" && body.session_context
    ? (body.session_context as Record<string, unknown>)
    : null;
  const sessionContext: SaintlyRealtimeToolContext = bodyCtxRaw
    ? {
        lead_id:
          typeof bodyCtxRaw.lead_id === "string" && bodyCtxRaw.lead_id.trim()
            ? bodyCtxRaw.lead_id.trim()
            : headerCtx.lead_id,
        recruit_id:
          typeof bodyCtxRaw.recruit_id === "string" && bodyCtxRaw.recruit_id.trim()
            ? bodyCtxRaw.recruit_id.trim()
            : headerCtx.recruit_id,
        employee_id:
          typeof bodyCtxRaw.employee_id === "string" && bodyCtxRaw.employee_id.trim()
            ? bodyCtxRaw.employee_id.trim()
            : headerCtx.employee_id,
        facility_id:
          typeof bodyCtxRaw.facility_id === "string" && bodyCtxRaw.facility_id.trim()
            ? bodyCtxRaw.facility_id.trim()
            : headerCtx.facility_id,
        patient_id:
          typeof bodyCtxRaw.patient_id === "string" && bodyCtxRaw.patient_id.trim()
            ? bodyCtxRaw.patient_id.trim()
            : headerCtx.patient_id,
        insurance_payer_id:
          typeof bodyCtxRaw.insurance_payer_id === "string" && bodyCtxRaw.insurance_payer_id.trim()
            ? bodyCtxRaw.insurance_payer_id.trim()
            : headerCtx.insurance_payer_id,
      }
    : headerCtx;

  const dispatched = await dispatchSaintlyRealtimeCrmTool({
    toolName,
    rawArgsJson:
      typeof rawArgumentsJson === "string" ? rawArgumentsJson : JSON.stringify(rawArgumentsJson),
    actorUserId: user.id,
    sessionContext,
  });

  const startedMs = typeof body.realtime_started_at_ms === "number" ? body.realtime_started_at_ms : null;
  if (startedMs && Date.now() - startedMs > 190_000) {
    console.warn("[realtime-tools] long-running session (>190s)");
  }

  return NextResponse.json({
    ok: dispatched.ok,
    output: dispatched.outputJson,
    tool_used: toolName,
    realtime_usage_notice:
      "OpenAI Realtime API usage bills per minute/session; disabling SAINTLY_REALTIME_AI_ENABLED stops new sessions.",
  });
}
