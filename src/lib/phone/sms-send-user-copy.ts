/** Shown in SMS composer UIs when Twilio/DB fails — never echo provider/Postgres details. */
export const SMS_SEND_FRIENDLY_TRY_AGAIN = "Message could not be sent. Please try again.";

/** Client-side max wait for threaded send server actions (Twilio timeout + DB + revalidate). */
export const SMS_SEND_CLIENT_MAX_WAIT_MS = 65_000;

/**
 * Bounded wait for a server action so the composer cannot spin forever if the network stalls.
 * Does not cancel work on the server.
 */
export async function awaitWithTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => resolve(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
  }
}
