/** 15-minute increments for dispatch scheduling (local wall time on submit). */

export const DISPATCH_VISIT_TIME_STEP_MIN = 15;

export type VisitTimeSlot = { value: string; label: string };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Build HH:mm options from 12:00 AM through 11:45 PM in 15-minute steps. */
export function buildDispatchVisitTimeSlots(): VisitTimeSlot[] {
  const out: VisitTimeSlot[] = [];
  for (let m = 0; m < 24 * 60; m += DISPATCH_VISIT_TIME_STEP_MIN) {
    const h24 = Math.floor(m / 60);
    const min = m % 60;
    const value = `${pad2(h24)}:${pad2(min)}`;
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const ampm = h24 < 12 ? "AM" : "PM";
    const label = `${hour12}:${pad2(min)} ${ampm}`;
    out.push({ value, label });
  }
  return out;
}
