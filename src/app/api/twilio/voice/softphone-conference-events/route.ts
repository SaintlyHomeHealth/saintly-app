import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { parseConferenceRoomName } from "@/lib/phone/inbound-browser-conference";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { logMoveToCellEvent } from "@/lib/phone/move-to-cell-events";
import { mergeMoveToCellMetadata } from "@/lib/phone/move-to-cell-metadata";
import { readMoveToCellMeta } from "@/lib/phone/move-to-cell-types";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import {
  type SoftphoneConferenceMeta,
  clientCallSidFromConferenceFriendlyName,
  isClientIdentityFrom,
} from "@/lib/twilio/softphone-conference";
import {
  hangupClientLegOnly,
  teardownSoftphoneConferenceFromMetadata,
} from "@/lib/twilio/softphone-conference-teardown";
import {
  removeBrowserParticipantFromConference,
  shouldSkipConferenceTeardownOnClientLeave,
} from "@/lib/twilio/move-to-cell-conference";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Conference participant callbacks for softphone + inbound browser conferences.
 * Outbound rooms: `sf-<ClientCallSid>`. Inbound rooms: `sf-in-<customerCallSid>`.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const friendly = p.FriendlyName?.trim() || "";
  const conferenceSid = p.ConferenceSid?.trim() || "";
  const participantCallSid = p.CallSid?.trim() || "";
  const from = p.From?.trim() || "";
  const label = (p.ParticipantLabel || p.participantLabel || "").trim().toLowerCase();
  const event = (p.StatusCallbackEvent || p.Event || "").trim().toLowerCase();

  const room = parseConferenceRoomName(friendly);
  const legacyClientSid = clientCallSidFromConferenceFriendlyName(friendly);
  const mergeLookupSid = room?.mergeLookupSid ?? legacyClientSid;
  if (!mergeLookupSid) {
    console.warn("[softphone-conference-events] skip_unrecognized_friendly_name", {
      friendly: friendly.slice(0, 80),
    });
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const isInbound = room?.kind === "inbound";
  const patch: Parameters<typeof mergeSoftphoneConferenceMetadata>[2] = {
    friendly_name: friendly,
    conference_sid: conferenceSid || undefined,
    last_conference_event: event || undefined,
    mode: "conference",
    direction: isInbound ? "inbound" : "outbound",
  };

  if (participantCallSid.startsWith("CA")) {
    if (isInbound) {
      if (label === "customer" || participantCallSid === room?.customerCallSid) {
        patch.pstn_call_sid = participantCallSid;
      } else if (
        label === "staff" ||
        (!label && isClientIdentityFrom(from)) ||
        (label !== "staff_cell" &&
          participantCallSid !== room?.customerCallSid &&
          !isClientIdentityFrom(from))
      ) {
        /** Browser staff leg only — never overwrite with staff_cell (move-to-cell PSTN leg). */
        patch.client_call_sid = participantCallSid;
      }
    } else if (participantCallSid === mergeLookupSid) {
      patch.client_call_sid = participantCallSid;
    } else {
      patch.pstn_call_sid = participantCallSid;
    }
  } else if (participantCallSid.length > 0) {
    console.log("[softphone-conference-events] skip_leg_mapping_non_ca_call_sid", {
      participantCallSid: participantCallSid.slice(0, 32),
      label,
      event,
    });
  } else if (label === "customer" || label === "pstn" || (!label && !isClientIdentityFrom(from))) {
    console.log("[softphone-conference-events] pstn_hint_no_call_sid_yet", { label, event, inbound: isInbound });
  } else if (label === "staff" || label === "staff_cell" || (!label && isClientIdentityFrom(from))) {
    console.log("[softphone-conference-events] staff_hint_no_call_sid_yet", { label, event });
  }

  console.log("[softphone-conference-events]", {
    friendly: friendly.slice(0, 48),
    event,
    kind: room?.kind ?? "legacy_outbound",
    conferenceSid: conferenceSid ? `${conferenceSid.slice(0, 12)}…` : null,
    participantCallSid: participantCallSid ? `${participantCallSid.slice(0, 12)}…` : null,
    label,
  });

  const result = await mergeSoftphoneConferenceMetadata(supabaseAdmin, mergeLookupSid, patch);
  if (!result.ok) {
    console.warn("[softphone-conference-events] merge_failed", result.error, {
      mergeLookupSid: mergeLookupSid.slice(0, 12),
    });
  }

  const eventLower = (event || "").toLowerCase();
  const isJoin =
    eventLower === "join" ||
    eventLower === "participant-join" ||
    eventLower.includes("participant-join");
  const isLeave =
    eventLower === "leave" ||
    eventLower === "participant-leave" ||
    eventLower.includes("participant-leave");

  if (participantCallSid.startsWith("CA") && isJoin && label === "staff_cell" && conferenceSid) {
    const rowJoin = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, mergeLookupSid);
    const metaJoin = rowJoin?.metadata as Record<string, unknown> | undefined;
    const moveToCellJoin = readMoveToCellMeta(metaJoin ?? null);
    const browserSidJoin = moveToCellJoin?.client_call_sid?.trim() ?? "";
    if (browserSidJoin && moveToCellJoin && browserSidJoin !== participantCallSid) {
      const removed = await removeBrowserParticipantFromConference({
        conferenceSid,
        clientCallSid: browserSidJoin,
      });
      if (removed.ok) {
        await mergeMoveToCellMetadata(supabaseAdmin, mergeLookupSid, {
          status: "connected_on_cell",
          cell_call_sid: participantCallSid,
        });
        await logMoveToCellEvent(supabaseAdmin, mergeLookupSid, "browser_leg_removed_after_cell_join", {
          cell_call_sid: participantCallSid,
          browser_call_sid: browserSidJoin,
        });
      }
    }
  }

  if (!participantCallSid.startsWith("CA") || !isLeave) {
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, mergeLookupSid);
  const meta = row?.metadata as Record<string, unknown> | undefined;
  const sc = meta?.softphone_conference as SoftphoneConferenceMeta | undefined;
  const moveToCell = readMoveToCellMeta(meta ?? null);
  const pstnStored = typeof sc?.pstn_call_sid === "string" ? sc.pstn_call_sid.trim() : "";
  const browserStored = typeof sc?.client_call_sid === "string" ? sc.client_call_sid.trim() : "";

  if (isInbound) {
    if (browserStored && participantCallSid === browserStored) {
      if (shouldSkipConferenceTeardownOnClientLeave(moveToCell)) {
        console.log("[softphone-conference-events] inbound staff left during move-to-cell — skip teardown");
      } else {
        console.log("[softphone-conference-events] inbound staff browser left — customer stays in conference");
      }
    } else if (pstnStored && participantCallSid === pstnStored && browserStored) {
      console.log("[softphone-conference-events] inbound customer left — end staff browser leg");
      await hangupClientLegOnly(browserStored, "inbound_customer_left_conference");
    }
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const outboundClientSid = mergeLookupSid;
  if (participantCallSid === outboundClientSid) {
    if (shouldSkipConferenceTeardownOnClientLeave(moveToCell)) {
      console.log("[softphone-conference-events] client leg left during move-to-cell — skip conference teardown");
    } else {
      await teardownSoftphoneConferenceFromMetadata({
        clientCallSid: outboundClientSid,
        softphoneConference: sc ?? null,
        reason: "participant_leave_client_leg",
      });
    }
  } else if (pstnStored && participantCallSid === pstnStored) {
    await hangupClientLegOnly(outboundClientSid, "participant_leave_primary_pstn");
  } else if (participantCallSid !== outboundClientSid) {
    console.log("[softphone-conference-events] participant leave (non-primary / 3-way)", {
      left: `${participantCallSid.slice(0, 10)}…`,
    });
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
