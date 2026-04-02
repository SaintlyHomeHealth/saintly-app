/**
 * Shared dispatch visit display + day overlap (local browser/server timezone).
 */

export function visitOverlapsLocalDay(
  scheduledFor: string | null,
  scheduledEndAt: string | null,
  dayStart: Date,
  dayEnd: Date
): boolean {
  if (!scheduledFor) return false;
  const startMs = new Date(scheduledFor).getTime();
  const endMs = new Date(scheduledEndAt ?? scheduledFor).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const ds = dayStart.getTime();
  const de = dayEnd.getTime();
  return startMs < de && endMs >= ds;
}

export function formatDispatchScheduleLine(
  scheduledFor: string | null,
  scheduledEndAt: string | null,
  timeWindowLabel: string | null
): string {
  if (timeWindowLabel?.trim()) return timeWindowLabel.trim();
  if (!scheduledFor) return "Unscheduled";
  const s = new Date(scheduledFor);
  if (Number.isNaN(s.getTime())) return "—";
  const end = scheduledEndAt ? new Date(scheduledEndAt) : null;
  const datePart = s.toLocaleString(undefined, { month: "short", day: "numeric" });
  const startClock = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!end || Number.isNaN(end.getTime()) || end.getTime() <= s.getTime()) {
    return `${datePart}, ${startClock}`;
  }
  const endClock = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${startClock}–${endClock}`;
}

export type ContactSnapshotInput = {
  primary_phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function buildVisitSnapshotsFromContact(contact: ContactSnapshotInput | null): {
  patient_phone_snapshot: string | null;
  address_snapshot: string | null;
} {
  if (!contact) {
    return { patient_phone_snapshot: null, address_snapshot: null };
  }
  const phone = (contact.primary_phone ?? "").replace(/\D/g, "");
  const patient_phone_snapshot = phone.length >= 10 ? phone : (contact.primary_phone ?? "").trim() || null;
  const line1 = (contact.address_line_1 ?? "").trim();
  const line2 = (contact.address_line_2 ?? "").trim();
  const city = (contact.city ?? "").trim();
  const state = (contact.state ?? "").trim();
  const zip = (contact.zip ?? "").trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address_snapshot = [line1, line2, cityLine].filter(Boolean).join(", ") || null;
  return { patient_phone_snapshot, address_snapshot };
}
