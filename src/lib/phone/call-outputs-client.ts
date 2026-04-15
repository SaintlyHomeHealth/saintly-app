/**
 * Client types + fetch for saved AI call outputs (`call_outputs` table).
 * Server route: GET /api/workspace/phone/call-outputs?callId=
 */

export type SavedCallOutputRow = {
  id: string;
  phone_call_id: string;
  type: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type SavedCallOutputsSuccess = {
  ok: true;
  phone_call_id: string;
  outputs: SavedCallOutputRow[];
};

export type SavedCallOutputsErrorBody = {
  error?: string;
};

export async function fetchSavedCallOutputs(phoneCallId: string): Promise<
  | { ok: true; data: SavedCallOutputsSuccess }
  | { ok: false; status: number; error: string }
> {
  const q = new URLSearchParams({ callId: phoneCallId.trim() });
  const res = await fetch(`/api/workspace/phone/call-outputs?${q.toString()}`, {
    credentials: "same-origin",
    cache: "no-store",
  });

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const err =
      json &&
      typeof json === "object" &&
      "error" in json &&
      typeof (json as SavedCallOutputsErrorBody).error === "string"
        ? (json as SavedCallOutputsErrorBody).error!
        : "Could not load saved outputs";
    return { ok: false, status: res.status, error: err };
  }

  if (
    !json ||
    typeof json !== "object" ||
    (json as SavedCallOutputsSuccess).ok !== true ||
    typeof (json as SavedCallOutputsSuccess).phone_call_id !== "string" ||
    !Array.isArray((json as SavedCallOutputsSuccess).outputs)
  ) {
    return { ok: false, status: 500, error: "Invalid response" };
  }

  return { ok: true, data: json as SavedCallOutputsSuccess };
}
