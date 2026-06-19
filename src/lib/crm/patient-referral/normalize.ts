import { normalizePhone } from "@/lib/phone/us-phone-format";

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

export function normalizeReferralDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const mm = mdy[1]!.padStart(2, "0");
    const dd = mdy[2]!.padStart(2, "0");
    let yy = mdy[3]!;
    if (yy.length === 2) yy = Number(yy) > 30 ? `19${yy}` : `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  const mon = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mon) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
      jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const m = months[mon[1]!.toLowerCase()];
    if (m) return `${mon[3]}-${m}-${mon[2]!.padStart(2, "0")}`;
  }
  return null;
}

export function normalizeReferralPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const n = normalizePhone(raw);
  return n || null;
}

export function parseLastFirstName(raw: string | null | undefined): { first_name: string | null; last_name: string | null } {
  if (!raw?.trim()) return { first_name: null, last_name: null };
  const s = raw.trim().replace(/\s+/g, " ");
  const comma = s.match(/^([^,]+),\s*(.+)$/);
  if (comma) {
    return { last_name: comma[1]!.trim() || null, first_name: comma[2]!.trim() || null };
  }
  const parts = s.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1]! };
  }
  return { first_name: s, last_name: null };
}

export function normalizeReferralState(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const up = raw.trim().toUpperCase().slice(0, 2);
  return US_STATE_CODES.has(up) ? up : raw.trim().slice(0, 2).toUpperCase();
}

export function normalizeReferralZip(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 5) return digits.slice(0, 5);
  return raw.trim().slice(0, 12);
}

export function normalizeVisitCount(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  const m = String(raw).match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function normalizeDisciplineCode(raw: string): string | null {
  const up = raw.trim().toUpperCase();
  if (["SN", "RN", "SKILLED NURSING"].includes(up)) return "SN";
  if (up === "PT") return "PT";
  if (up === "OT") return "OT";
  if (["ST", "SLP", "SPEECH"].includes(up)) return "ST";
  if (up === "MSW") return "MSW";
  if (["HHA", "AIDE", "HOME HEALTH AIDE"].includes(up)) return "HHA";
  return null;
}

export function saintlyAgencyAssigned(agency: string | null | undefined): boolean {
  if (!agency?.trim()) return false;
  return /saintly\s+home\s+health/i.test(agency);
}

export function extractAgeFromDob(dobIso: string | null): number | null {
  if (!dobIso || !/^\d{4}-\d{2}-\d{2}$/.test(dobIso)) return null;
  const dob = new Date(`${dobIso}T12:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
