import "server-only";

/**
 * Maps internal CRM voice-save failures to short, non-sensitive copy for the browser.
 * Full details stay in Vercel / server logs only.
 */
export function crmVoiceSaveUserFacingMessage(internal: string): string {
  const t = (internal ?? "").trim();
  const low = t.toLowerCase();

  if (!t) {
    return "Task could not be saved. Please try again.";
  }

  if (t === "Unauthorized") {
    return "You need to sign in again before saving.";
  }

  if (t === "Forbidden") {
    return "You do not have permission to create CRM tasks.";
  }

  // RLS / auth-style denials from Postgres or PostgREST
  if (
    low.includes("new row violates row-level security policy") ||
    low.includes("violates row-level security") ||
    (low.includes("permission denied") &&
      !low.includes("violates check constraint")) ||
    /\b42501\b/.test(low)
  ) {
    return "You do not have permission to create CRM tasks.";
  }

  // Client / validation-shaped failures (do not echo raw payloads)
  if (
    low.includes("title required") ||
    low.includes("transcript missing") ||
    low.includes("no tasks with a title") ||
    low.includes("no tasks to save") ||
    low.includes("voice-reviewed tasks require transcript") ||
    low.includes("invalid row") ||
    low.includes("invalid input syntax") ||
    low.includes("invalid input syntax for type uuid") ||
    /\b(uuid|22p02|23514)\b/i.test(low) ||
    low.includes("violates check constraint") ||
    low.includes("violates foreign key constraint")
  ) {
    return "The task data was invalid. Please edit the task and try again.";
  }

  // Likely infra / DB layer (including PostgREST, SELECT-after-insert, concurrency)
  if (
    low.includes("crm_tasks") ||
    low.includes("postgrest") ||
    low.includes("fetch failed") ||
    low.includes("network") ||
    low.includes("etag") ||
    low.includes("pgrst") ||
    /\b502\b/.test(low) ||
    /\b503\b/.test(low) ||
    low.includes("read back") ||
    low.includes("verify rls select") ||
    low.includes("could not save task") ||
    low.includes("save failed:") ||
    low.includes("duplicate key") ||
    /\b23505\b/.test(low)
  ) {
    return "Database save failed. Check server logs for [crm_voice_save].";
  }

  return "Task could not be saved. Please try again.";
}
