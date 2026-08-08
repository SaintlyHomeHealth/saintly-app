"use client";

/**
 * Serial client queue so the fax inbox can auto-fill blank notes without
 * stampeding OpenAI when many rows mount at once.
 */
const attempted = new Set<string>();
let chain: Promise<void> = Promise.resolve();

export function enqueueFaxAutoSummarize(faxId: string, run: () => Promise<void>): boolean {
  const id = faxId.trim();
  if (!id || attempted.has(id)) return false;
  attempted.add(id);
  chain = chain
    .then(() => run())
    .catch(() => {
      /* per-run errors handled by caller */
    });
  return true;
}

/** Allow a later retry (e.g. after a transient failure) once the page is refreshed. */
export function clearFaxAutoSummarizeAttempt(faxId: string): void {
  attempted.delete(faxId.trim());
}
