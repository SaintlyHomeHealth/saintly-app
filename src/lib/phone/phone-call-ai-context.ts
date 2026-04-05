/**
 * Shared context + OpenAI JSON helpers for phone call AI (CRM drawer + background voice AI).
 */

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactNameEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactNameEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactNameEmbed;
  }
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

function voicemailTranscriptExcerptFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  const vt = m.voicemail_transcription;
  if (!vt || typeof vt !== "object" || Array.isArray(vt)) return null;
  const t = typeof (vt as { text?: unknown }).text === "string" ? (vt as { text: string }).text.trim() : "";
  return t ? t.slice(0, 6000) : null;
}

function formatCrmMetadataForPrompt(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "(none)";
  }
  const crm = (metadata as Record<string, unknown>).crm;
  if (!crm || typeof crm !== "object" || Array.isArray(crm)) {
    return "(none)";
  }
  const c = crm as Record<string, unknown>;
  const type = typeof c.type === "string" ? c.type : "";
  const outcome = typeof c.outcome === "string" ? c.outcome : "";
  const tags = typeof c.tags === "string" ? c.tags : "";
  const note = typeof c.note === "string" ? c.note : "";
  const parts = [`saved type: ${type || "—"}`, `saved outcome: ${outcome || "—"}`, `saved tags: ${tags || "—"}`];
  if (note.trim()) {
    parts.push(`saved note (excerpt): ${note.trim().slice(0, 400)}`);
  }
  return parts.join("\n");
}

/** Structured lines for CRM + voice AI prompts (metadata only; no staff auth). */
export function buildPhoneCallAiContextBlock(raw: Record<string, unknown>): string {
  const direction = typeof raw.direction === "string" ? raw.direction : "";
  const status = typeof raw.status === "string" ? raw.status : "";
  const fromE164 = typeof raw.from_e164 === "string" ? raw.from_e164 : "";
  const toE164 = typeof raw.to_e164 === "string" ? raw.to_e164 : "";
  const primaryTag = typeof raw.primary_tag === "string" ? raw.primary_tag : "";
  const contactId = typeof raw.contact_id === "string" ? raw.contact_id : null;
  const startedAt = typeof raw.started_at === "string" ? raw.started_at : "";
  const endedAt = typeof raw.ended_at === "string" ? raw.ended_at : "";
  const duration =
    typeof raw.duration_seconds === "number" && Number.isFinite(raw.duration_seconds)
      ? String(Math.round(raw.duration_seconds))
      : "";
  const vmSid = typeof raw.voicemail_recording_sid === "string" ? raw.voicemail_recording_sid : null;
  const priorityReason =
    typeof raw.priority_sms_reason === "string" ? raw.priority_sms_reason.trim() : "";
  const autoReplyBody =
    typeof raw.auto_reply_sms_body === "string" ? raw.auto_reply_sms_body.trim().slice(0, 300) : "";

  const crmName = crmDisplayNameFromContactsRaw(raw.contacts);
  const vmExcerpt = voicemailTranscriptExcerptFromMetadata(raw.metadata);
  const lines = [
    `Direction: ${direction || "—"}`,
    `Status: ${status || "—"}`,
    `From E.164: ${fromE164 || "—"}`,
    `To E.164: ${toE164 || "—"}`,
    `Started: ${startedAt || "—"}`,
    `Ended: ${endedAt || "—"}`,
    `Duration seconds: ${duration || "—"}`,
    `Primary tag (system): ${primaryTag || "—"}`,
    `Contact linked: ${contactId ? "yes" : "no"}`,
    `CRM contact display name: ${crmName || "—"}`,
    `Voicemail recording present: ${vmSid ? "yes" : "no"}`,
    priorityReason ? `Priority SMS reason: ${priorityReason}` : null,
    autoReplyBody ? `Auto-reply SMS (excerpt): ${autoReplyBody}` : null,
    `Existing metadata.crm:\n${formatCrmMetadataForPrompt(raw.metadata)}`,
    vmExcerpt ? `Voicemail transcript (may contain PHI — minimize in model outputs):\n${vmExcerpt}` : null,
  ].filter((x): x is string => Boolean(x));

  return lines.join("\n");
}

export function parseOpenAiJsonContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Low-level JSON-object completion; returns parsed JSON or null. */
export async function fetchOpenAiJsonObject(
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
      model: "gpt-4o-mini",
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
    console.warn("[phone-call-ai] OpenAI HTTP:", res.status, t.slice(0, 200));
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
