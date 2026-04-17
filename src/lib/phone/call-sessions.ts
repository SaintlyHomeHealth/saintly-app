import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhoneCallStatus } from "@/lib/phone/log-call";

export type CallSessionStatus = "ringing" | "answered" | "declined" | "missed" | "ended";

function ringTimeoutSeconds(): number {
  const raw = process.env.CALL_SESSION_RING_TIMEOUT_SECONDS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 30;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(120, Math.max(10, n));
}

function isTerminalPhoneStatus(status: PhoneCallStatus): boolean {
  return (
    status === "completed" ||
    status === "missed" ||
    status === "abandoned" ||
    status === "failed" ||
    status === "cancelled"
  );
}

/**
 * Creates one ringing session per target user (same Twilio CallSid). Service role only.
 */
export async function createRingingCallSessions(
  supabase: SupabaseClient,
  input: {
    callSid: string;
    phoneCallId: string;
    userIds: string[];
    fromE164: string | null;
    toE164: string | null;
  }
): Promise<{ ok: true; sessionIds: string[] } | { ok: false; error: string }> {
  const callSid = input.callSid.trim();
  if (!callSid) {
    return { ok: false, error: "callSid is required" };
  }
  const uniqueUsers = [...new Set(input.userIds.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUsers.length === 0) {
    return { ok: true, sessionIds: [] };
  }

  const ringSeconds = ringTimeoutSeconds();
  const ringExpiresAt = new Date(Date.now() + ringSeconds * 1000).toISOString();

  const rows = uniqueUsers.map((userId) => ({
    user_id: userId,
    call_sid: callSid,
    phone_call_id: input.phoneCallId,
    status: "ringing" as const,
    ring_expires_at: ringExpiresAt,
    from_e164: input.fromE164,
    to_e164: input.toE164,
  }));

  const { data, error } = await supabase.from("call_sessions").insert(rows).select("id");

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: selErr } = await supabase
        .from("call_sessions")
        .select("id")
        .eq("call_sid", callSid)
        .in("user_id", uniqueUsers);
      if (selErr) {
        return { ok: false, error: selErr.message };
      }
      return { ok: true, sessionIds: (existing ?? []).map((r) => r.id as string) };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, sessionIds: (data ?? []).map((r) => r.id as string) };
}

/**
 * Twilio bridged audio (someone picked up) — stop ringing on all devices still in `ringing`.
 */
async function syncOnInProgress(supabase: SupabaseClient, externalCallId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("call_sessions")
    .update({ status: "ended", ended_at: now })
    .eq("call_sid", externalCallId)
    .eq("status", "ringing");

  if (error) {
    console.warn("[call_sessions] sync in_progress:", error.message);
  }
}

function terminalSessionStatus(
  mapped: PhoneCallStatus,
  previous: CallSessionStatus
): "missed" | "ended" {
  if (previous === "answered" || previous === "declined") {
    return "ended";
  }
  if (previous !== "ringing") {
    return "ended";
  }
  if (mapped === "missed" || mapped === "failed" || mapped === "cancelled" || mapped === "abandoned") {
    return "missed";
  }
  return "ended";
}

/**
 * Aligns DB ringing state with `phone_calls` / Twilio callbacks so all devices dismiss together.
 */
export async function syncCallSessionsFromPhoneStatus(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    mapped: PhoneCallStatus;
  }
): Promise<void> {
  const externalCallId = input.externalCallId.trim();
  if (!externalCallId) return;

  if (input.mapped === "in_progress") {
    await syncOnInProgress(supabase, externalCallId);
    return;
  }

  if (!isTerminalPhoneStatus(input.mapped)) {
    return;
  }

  const { data: rows, error } = await supabase
    .from("call_sessions")
    .select("id, status")
    .eq("call_sid", externalCallId)
    .in("status", ["ringing", "answered", "declined"]);

  if (error) {
    console.warn("[call_sessions] load for terminal sync:", error.message);
    return;
  }

  const now = new Date().toISOString();
  for (const row of rows ?? []) {
    const id = row.id as string;
    const prev = row.status as CallSessionStatus;
    const next = terminalSessionStatus(input.mapped, prev);
    const { error: upErr } = await supabase
      .from("call_sessions")
      .update({ status: next, ended_at: now })
      .eq("id", id)
      .eq("status", prev);
    if (upErr) {
      console.warn("[call_sessions] terminal update:", upErr.message);
    }
  }
}

/**
 * Marks stale `ringing` rows as `missed` (safety net). Run from cron.
 */
export async function expireStaleRingingCallSessions(
  supabase: SupabaseClient
): Promise<{ updated: number }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("call_sessions")
    .update({ status: "missed", ended_at: now })
    .eq("status", "ringing")
    .lt("ring_expires_at", now)
    .select("id");

  if (error) {
    console.warn("[call_sessions] expire stale:", error.message);
    return { updated: 0 };
  }
  return { updated: (data ?? []).length };
}
