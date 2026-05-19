import type { SalesAgentDuplicateHit } from "@/lib/sales-agent/sales-agent-lead-duplicate-check";
import { formatSalesAgentFriendlyStatus } from "@/lib/sales-agent/sales-agent-status-labels";

/** Safe, non-PHI hints for duplicate warnings (no SSN, Medicare, or full phone). */
export function salesAgentDuplicateMatchHints(hit: SalesAgentDuplicateHit): string[] {
  const hints: string[] = [];
  for (const reason of hit.matchedBy) {
    switch (reason) {
      case "phone":
        hints.push(
          hit.phoneLast4 ? `Phone ending in ${hit.phoneLast4}` : "Matching phone number"
        );
        break;
      case "name_dob":
        hints.push("Matching patient name and date of birth");
        break;
      case "medicare":
        hints.push("Medicare number already on file");
        break;
      default:
        break;
    }
  }
  return hints;
}

export function salesAgentDuplicateStatusLabel(status: string | null | undefined): string {
  return formatSalesAgentFriendlyStatus(status);
}
