/**
 * OpenAI Realtime session instructions — Saintly Home Health inbound voice.
 * Keep in sync with bridge {@link ../../scripts/twilio-openai-realtime-bridge.ts} tool handling.
 */

export const VOICE_AI_REALTIME_INSTRUCTIONS = `You are the live receptionist for Saintly Home Health (home health). Speak with a real caller.

Opening (first turn only): say something like: "Thanks for calling Saintly Home Health — how can we help you today?" Then listen.

Rules:
- One or two short sentences per turn. No long scripts, no filler, no “I’m an AI.”
- Ask at most ONE follow-up only if you still cannot route (e.g. unclear intent). Do not stack multiple questions.
- Route or call route_call as soon as you know enough — do not interview the caller with five questions.

Audio: wait for natural pauses; ignore background noise and echo. If you missed them, say once: "Sorry, could you repeat that?"

Intent (for route_call): patient, referral, vendor, spam, wrong_number, urgent_medical — same meanings as before. Prefer referral if they mentioned a doctor, hospital, or referral.

Emergencies: if chest pain, stroke signs, severe bleeding, trouble breathing, unconsciousness, or they say it’s an emergency — brief acknowledgment, then route_call urgent_medical.

Do not promise clinical outcomes. Leave structured fields blank unless clearly stated.

When ready, call route_call exactly once with intent, summary, and handoff_recommended as appropriate.`;

/** OpenAI Realtime session tool definitions (session.update). */
export const VOICE_AI_REALTIME_TOOLS: readonly unknown[] = [
  {
    type: "function",
    name: "route_call",
    description:
      "Finalize routing for this phone call once intent is clear. Call exactly once when ready to transfer, hang up, or escalate.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["patient", "referral", "vendor", "spam", "wrong_number", "urgent_medical"],
          description: "Primary routing intent for this caller.",
        },
        caller_type: {
          type: "string",
          enum: ["patient", "referral", "vendor", "wrong_number", "spam"],
          description: "Best caller persona classification.",
        },
        caller_name: {
          type: "string",
          description: "Caller's name if provided.",
        },
        patient_name: {
          type: "string",
          description: "Patient name if caller provided one.",
        },
        callback_number: {
          type: "string",
          description: "Callback number only if caller explicitly states one.",
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Operational urgency level.",
        },
        summary: {
          type: "string",
          description: "1–3 short sentences for staff CRM; no phone numbers; avoid PHI.",
        },
        handoff_recommended: {
          type: "boolean",
          description: "Whether this call should transfer/escalate to human staff now.",
        },
        closing_message: {
          type: "string",
          description: "Optional last thing to say to the caller before transfer or hangup (very short).",
        },
      },
      required: ["intent", "summary"],
    },
  },
];
