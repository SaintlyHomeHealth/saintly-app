export type FaxFailureClass =
  | "busy"
  | "no_answer"
  | "invalid_number"
  | "rejected"
  | "document_error"
  | "other";

export const FAX_FAILURE_LABEL: Record<FaxFailureClass, string> = {
  busy: "Busy",
  no_answer: "No answer",
  invalid_number: "Invalid number",
  rejected: "Rejected",
  document_error: "Document error",
  other: "Failed",
};

export function classifyFaxFailure(reason: string | null | undefined, providerCode?: string | null): FaxFailureClass {
  const hay = `${reason ?? ""} ${providerCode ?? ""}`.toLowerCase();
  if (!hay.trim()) return "other";
  if (/\bbusy\b|user busy|line busy/.test(hay)) return "busy";
  if (/no answer|no_answer|not answered|timeout|timed out|ring/.test(hay)) return "no_answer";
  if (/invalid|unallocated|not a valid|wrong number|does not exist/.test(hay)) return "invalid_number";
  if (/reject|declined|forbidden|blocked|do not/.test(hay)) return "rejected";
  if (/document|pdf|media|file|page count|corrupt/.test(hay)) return "document_error";
  return "other";
}

export function isFaxFailureRetryable(kind: FaxFailureClass): boolean {
  return kind === "busy" || kind === "no_answer" || kind === "other";
}
