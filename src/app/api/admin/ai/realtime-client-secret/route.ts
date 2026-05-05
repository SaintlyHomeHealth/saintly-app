import { NextResponse } from "next/server";

import {
  isSaintlyRealtimeAiEnabledRuntime,
  saintlyRealtimeMaxOutputTokens,
  saintlyRealtimeMaxSessionMs,
  saintlyRealtimeModel,
} from "@/lib/crm/saintly-ai-voice-config";
import { CRM_REALTIME_SYSTEM_INSTRUCTIONS } from "@/lib/crm/saintly-realtime-instructions";
import { SAINTLY_CRM_REALTIME_TOOLS } from "@/lib/crm/saintly-realtime-crm-tools";
import { requireCrmTasksStaff } from "@/lib/crm/require-crm-tasks-staff";

/**
 * Mints ephemeral Realtime credential for browsers. Requires dual flags (public + server).
 */
export async function POST() {
  if (!isSaintlyRealtimeAiEnabledRuntime()) {
    return NextResponse.json({ error: "Realtime AI disabled" }, { status: 403 });
  }
  const gate = await requireCrmTasksStaff();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 503 });
  }

  const model = saintlyRealtimeModel();
  const payload = {
    session: {
      type: "realtime",
      model,
      modalities: ["text", "audio"],
      instructions: CRM_REALTIME_SYSTEM_INSTRUCTIONS,
      tools: SAINTLY_CRM_REALTIME_TOOLS,
      max_output_tokens: saintlyRealtimeMaxOutputTokens(),
      audio: {
        output: {
          voice: "alloy",
        },
      },
    },
  };

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[crm/realtime-client-secret]", res.status, t.slice(0, 500));
    return NextResponse.json({ error: "Could not mint client secret", detail: t.slice(0, 200) }, { status: 502 });
  }

  const data = (await res.json()) as {
    client_secret?: { value?: string; expires_at?: number };
    expires_at?: number;
    value?: string;
  };

  const secretValue = data.client_secret?.value ?? data.value;
  const expiresAt = data.client_secret?.expires_at ?? data.expires_at ?? null;

  if (typeof secretValue !== "string" || !secretValue.trim()) {
    return NextResponse.json({ error: "Unexpected OpenAI payload" }, { status: 502 });
  }

  return NextResponse.json({
    ephemeral_key: secretValue,
    expires_at: expiresAt,
    model,
    max_session_ms: saintlyRealtimeMaxSessionMs(),
    cost_notice:
      "ChatGPT Plus does not include API quota. OPENAI billing is metered separately; realtime audio can add up quickly.",
  });
}
