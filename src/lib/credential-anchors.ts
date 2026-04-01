/**
 * Stable hash targets for credential summary → Credential Expiration Tracking jumps.
 * Alias rules stay aligned with `normalizeCredentialTypeKey` in the employee detail page.
 */
export function getCredentialAnchorId(
  credentialType: string | null | undefined
): string {
  const t = (credentialType || "").toLowerCase().trim();
  let normalized = t;

  if (t === "cpr" || t === "cpr_card" || t === "cpr_bls" || t === "bls_cpr") {
    normalized = "cpr";
  } else if (
    t === "fingerprint_clearance_card" ||
    t === "fingerprint_card" ||
    t === "az_fingerprint_clearance_card"
  ) {
    normalized = "fingerprint_clearance_card";
  } else if (t === "insurance") {
    normalized = "independent_contractor_insurance";
  }

  if (!normalized) return "credential-unknown";

  return `credential-${normalized.replace(/_/g, "-")}`;
}
