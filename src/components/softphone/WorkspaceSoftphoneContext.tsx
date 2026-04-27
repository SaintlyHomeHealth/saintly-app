"use client";

import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ConferenceGatingSnapshot } from "@/lib/phone/conference-gating";
import type { LiveTranscriptEntry } from "@/lib/phone/live-transcript-entries";
import type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";
import type { SoftphoneRecordingMeta } from "@/lib/twilio/softphone-recording-types";

export type CallContextVoiceAi = {
  short_summary: string | null;
  urgency: string | null;
  route_target: string | null;
  caller_category: string | null;
  live_transcript_excerpt: string | null;
  /** Append-only lines from Media Stream bridge (preferred over excerpt for live UI). */
  live_transcript_entries: LiveTranscriptEntry[] | null;
  recommended_action: string | null;
  confidence_summary: string | null;
  softphone_transcript_streams: SoftphoneTranscriptStreamsMeta | null;
  /** Inbound PSTN transcript-only stream started server-side (no Enable click). */
  inbound_transcript_stream_started_at: string | null;
  inbound_transcript_mode: string | null;
  inbound_transcript_last_error: string | null;
};

export type SoftphoneConferenceContext = {
  conference_sid: string | null;
  pstn_call_sid: string | null;
  pstn_on_hold: boolean | null;
  mode: string | null;
};

export type CallDeskContext = {
  /** Twilio Client leg CallSid — matches `phone_calls.external_call_id` and server logs. */
  external_call_id: string | null;
  /** `phone_calls.id` for CRM / saved artifacts (when call-context found the row). */
  phone_call_id: string | null;
  voice_ai: CallContextVoiceAi | null;
  conference: SoftphoneConferenceContext | null;
  /** Server-computed gating — use for disabling controls with real reasons. */
  conference_gating: ConferenceGatingSnapshot | null;
  /** Manual recording state from `phone_calls.metadata.softphone_recording`. */
  softphone_recording: SoftphoneRecordingMeta | null;
  /** Staff softphone row (`metadata.source=twilio_voice_softphone`) — transcript is human-only. */
  workspace_softphone_session: boolean;
};

/** Snapshot after hangup so staff can review transcript + run post-call tools. */
export type PostCallTranscriptSnapshot = {
  desk: CallDeskContext;
  remoteLabel: string | null;
};

export type OutboundLineInfo = { e164: string; label: string; is_default: boolean };

/** Server flags from `/api/workspace/phone/softphone-capabilities` (no secrets). */
export type SoftphoneServerCapabilities = {
  conference_outbound_enabled: boolean;
  media_stream_wss_configured: boolean;
  transcription_callback_configured?: boolean;
  legacy_bridge_transcript_configured?: boolean;
  transcript_writeback_configured: boolean;
  org_label?: string | null;
  staff_user_id?: string | null;
  outbound_lines?: OutboundLineInfo[];
  outbound_default_e164?: string | null;
  outbound_block_available?: boolean;
};

/** Persisted "Call as" selection for outbound PSTN From (validated server-side). */
export type OutboundCliSelection = { kind: "line"; e164: string } | { kind: "block" };

export type WorkspaceSoftphoneContextValue = {
  digits: string;
  setDigits: Dispatch<SetStateAction<string>>;
  listenState: "loading" | "ready" | "error";
  /** True while the Twilio Client leg is connected (answered outbound or inbound). */
  isInCall: boolean;
  status: "idle" | "fetching_token" | "connecting" | "in_call" | "error";
  hint: string | null;
  /** Extra UI for mapped Twilio/WebRTC errors (Settings / retry). */
  hintMeta: { suggestSettings: boolean; canRetry: boolean } | null;
  incomingCallerContactName: string | null;
  incomingCallerNumberFormatted: string;
  incomingCallerRawFrom: string | null;
  activeRemoteLabel: string | null;
  tokenIdentity: string | null;
  ringtoneUnlocked: boolean;
  busy: boolean;
  canDial: boolean;
  incoming: boolean;
  durationSec: number;
  /** Microphone mute (Twilio `Call.mute`). */
  micMuted: boolean;
  /** Client-side hold fallback when conference PSTN hold is unavailable. */
  isClientHold: boolean;
  /** Twilio Conference PSTN participant hold (true PSTN hold + hold music). */
  isPstnHold: boolean;
  holdBusy: boolean;
  toggleMute: () => void;
  toggleHold: () => Promise<void>;
  /** Second inbound while already on an active call (call waiting). */
  callWaiting: boolean;
  callWaitingCallerContactName: string | null;
  callWaitingNumberFormatted: string;
  callWaitingRawFrom: string | null;
  answerCallWaitingEndAndAccept: () => void;
  declineCallWaiting: () => void;
  /** AI summary + conference metadata polled from `phone_calls` for this CallSid. */
  callContext: CallDeskContext | null;
  /** Twilio env flags for conference + media stream (UI gating). */
  softphoneCapabilities: SoftphoneServerCapabilities | null;
  coldTransferTo: (toE164: string) => Promise<{ ok: boolean; error?: string }>;
  addConferenceParticipant: (toE164: string) => Promise<{ ok: boolean; error?: string }>;
  startLiveTranscriptStream: () => Promise<{ ok: boolean; error?: string }>;
  stopLiveTranscriptStream: () => Promise<{ ok: boolean; error?: string }>;
  /** Manual Dialpad-style: user must opt in before we treat transcript as "on". */
  transcriptEnabled: boolean;
  setTranscriptEnabled: Dispatch<SetStateAction<boolean>>;
  transcriptPanelOpen: boolean;
  setTranscriptPanelOpen: Dispatch<SetStateAction<boolean>>;
  /** After hangup: last call desk + label for transcript review (cleared on dismiss or new call). */
  postCallTranscriptSnapshot: PostCallTranscriptSnapshot | null;
  dismissTranscriptPanel: () => void;
  enableTranscriptManual: () => Promise<void>;
  /** True while POST start-transcript is in flight (Enable Transcript / auto inbound). */
  transcriptStartPending: boolean;
  /** Set when start-transcript failed; cleared on success or new call. */
  transcriptStartError: string | null;
  clearTranscriptStartError: () => void;
  /** Manual Twilio-backed recording (metadata on phone_calls). */
  softphoneRecording: SoftphoneRecordingMeta | null;
  recordingBusy: boolean;
  recordingActionError: string | null;
  toggleCallRecording: () => Promise<void>;
  sendDtmfDigits: (digits: string) => void;
  /** Last call-context fetch failed (for transcript empty state). */
  callContextLoadError: boolean;
  clearCallError: () => void;
  startCall: (toOverride?: string) => Promise<void>;
  /** Outbound "Call as" (caller ID); `null` before capabilities hydrate. */
  outboundCliSelection: OutboundCliSelection | null;
  setOutboundCliSelection: Dispatch<SetStateAction<OutboundCliSelection | null>>;
  hangUp: () => void;
  answerIncoming: () => void;
  rejectIncoming: () => void;
  testRingtone: () => Promise<void>;
  unlockRingtoneFromGesture: () => Promise<void>;
};

export const WorkspaceSoftphoneContext = createContext<WorkspaceSoftphoneContextValue | null>(null);

/**
 * Narrow layout flag: true only while `status === "in_call"`.
 * Use for bottom nav + main padding so a 1Hz call timer does not re-render those consumers.
 */
export const WorkspacePhoneInCallLayoutContext = createContext(false);

export function useWorkspacePhoneInCallLayout(): boolean {
  return useContext(WorkspacePhoneInCallLayoutContext);
}

export function useWorkspaceSoftphone() {
  const ctx = useContext(WorkspaceSoftphoneContext);
  if (!ctx) {
    throw new Error("useWorkspaceSoftphone must be used within WorkspaceSoftphoneProvider");
  }
  return ctx;
}

/**
 * Same context as {@link useWorkspaceSoftphone} but returns `null` outside
 * `WorkspaceSoftphoneProvider` (e.g. embedded CRM thread). Use when the UI can
 * degrade (empty outbound lines until workspace shell is present).
 */
export function useOptionalWorkspaceSoftphone() {
  return useContext(WorkspaceSoftphoneContext);
}
