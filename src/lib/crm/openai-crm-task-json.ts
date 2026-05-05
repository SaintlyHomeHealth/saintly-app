import "server-only";

import { parseOpenAiJsonContent } from "@/lib/phone/phone-call-ai-context";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";

/**
 * CRM-specific JSON-object completion with configurable chat model (server-only — never imported by client bundles).
 */
export async function fetchCrmOpenAiJsonObject(
  model: string,
  systemPrompt: string,
  userContent: string
): Promise<unknown | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return null;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.trim() || saintlyCrmTaskExtractionModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("[crm-task-ai] OpenAI HTTP:", res.status, t.slice(0, 240));
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }

  return parseOpenAiJsonContent(content);
}
