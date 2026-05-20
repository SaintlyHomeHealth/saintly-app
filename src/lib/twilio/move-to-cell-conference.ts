import twilio from "twilio";

/**
 * Remove only the browser Client participant from an active conference (customer PSTN stays connected).
 */
export async function removeBrowserParticipantFromConference(input: {
  conferenceSid: string;
  clientCallSid: string;
}): Promise<{ ok: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const conferenceSid = input.conferenceSid.trim();
  const clientSid = input.clientCallSid.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "Twilio credentials missing" };
  }
  if (!conferenceSid.startsWith("CF") || !clientSid.startsWith("CA")) {
    return { ok: false, error: "invalid conference or client CallSid" };
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.conferences(conferenceSid).participants(clientSid).remove();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[move-to-cell] remove browser participant failed, trying call complete", msg);
    try {
      const client = twilio(accountSid, authToken);
      await client.calls(clientSid).update({ status: "completed" });
      return { ok: true };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      return { ok: false, error: msg2.slice(0, 200) };
    }
  }
}

/**
 * After staff_cell joins, make that leg end the conference when it hangs up (customer must not stay alone).
 */
export async function setStaffCellEndConferenceOnExit(input: {
  conferenceSid: string;
  cellCallSid: string;
}): Promise<{ ok: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const conferenceSid = input.conferenceSid.trim();
  const cellSid = input.cellCallSid.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "Twilio credentials missing" };
  }
  if (!conferenceSid.startsWith("CF") || !cellSid.startsWith("CA")) {
    return { ok: false, error: "invalid conference or cell CallSid" };
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.conferences(conferenceSid).participants(cellSid).update({ endConferenceOnExit: true });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 200) };
  }
}

/** True when client leg left conference due to intentional move-to-cell (do not tear down customer). */
export function shouldSkipConferenceTeardownOnClientLeave(
  moveToCell: { status?: string } | null | undefined
): boolean {
  const s = (moveToCell?.status ?? "").trim();
  return s === "ringing" || s === "press_1" || s === "connected_on_cell";
}
