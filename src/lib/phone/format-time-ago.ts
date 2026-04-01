/** Relative wall time for call-log urgency (server render uses request time as "now"). */
export function formatTimeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/** Whole minutes elapsed since `date` (for missed-call urgency thresholds). */
export function minutesSince(date: string | Date): number {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return Number.POSITIVE_INFINITY;
  return Math.floor(diffMs / (1000 * 60));
}
