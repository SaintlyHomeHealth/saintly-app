/** Default copy for quick-send; optional per-name variant in `sendNurseOnTheWaySms` (actions). */
export const NURSE_ON_THE_WAY_MESSAGE =
  "Hi from Saintly Home Health — your nurse is on the way. Reply if you need anything.";

export function nurseLabelFromStaffEmail(email: string | null | undefined): string | null {
  const e = typeof email === "string" ? email.trim() : "";
  if (!e) return null;
  const local = e.split("@")[0]?.trim();
  if (!local) return null;
  const words = local.replace(/[._+-]+/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
