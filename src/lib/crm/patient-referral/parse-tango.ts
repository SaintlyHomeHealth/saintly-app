import "server-only";

import type { ParsedPatientReferralSuggestions } from "./types";
import {
  extractAgeFromDob,
  normalizeReferralDate,
  normalizeReferralPhone,
  normalizeReferralState,
  normalizeReferralZip,
  normalizeVisitCount,
  parseLastFirstName,
  saintlyAgencyAssigned,
} from "./normalize";

const TANGO_MARKERS = [
  /\btango\b/i,
  /\bdina\b/i,
  /authorization\s+number/i,
  /authorization\s+approvals\s+total/i,
  /agency\s+assigned/i,
];

export function isTangoReferralDocument(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return TANGO_MARKERS.filter((re) => re.test(t)).length >= 2;
}

function fieldAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n\\r]{1,200})`, "i");
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function parseVisitTable(text: string): Partial<ParsedPatientReferralSuggestions> {
  const out: Partial<ParsedPatientReferralSuggestions> = {};
  const rows = [
    { keys: ["SN", "Skilled Nursing", "RN"], field: "skilled_nursing_visits" as const },
    { keys: ["PT"], field: "pt_visits" as const },
    { keys: ["OT"], field: "ot_visits" as const },
    { keys: ["ST", "SLP"], field: "st_visits" as const },
    { keys: ["MSW"], field: "msw_visits" as const },
    { keys: ["HHA", "Aide"], field: "hha_visits" as const },
  ];
  const approved: string[] = [];
  for (const row of rows) {
    for (const key of row.keys) {
      const re = new RegExp(`\\b${key}\\b[^\\d\\n]{0,30}(\\d{1,4})`, "i");
      const m = text.match(re);
      if (m?.[1]) {
        const n = normalizeVisitCount(m[1]);
        if (n != null) {
          out[row.field] = n;
          approved.push(key === "Skilled Nursing" || key === "RN" ? "SN" : key);
        }
      }
    }
  }
  if (approved.length) out.approved_disciplines = [...new Set(approved)];
  const total =
    (out.skilled_nursing_visits ?? 0) +
    (out.pt_visits ?? 0) +
    (out.ot_visits ?? 0) +
    (out.st_visits ?? 0) +
    (out.msw_visits ?? 0) +
    (out.hha_visits ?? 0);
  if (total > 0) out.total_authorized_visits = total;
  return out;
}

export function parseTangoReferralText(text: string): ParsedPatientReferralSuggestions | null {
  if (!isTangoReferralDocument(text)) return null;

  const out: ParsedPatientReferralSuggestions = {
    referral_source_type: "tango_dina",
    document_type: "tango_authorization",
    intake_status: "New Referral",
    patient_status: "pending",
  };

  const authNum =
    fieldAfterLabel(text, ["Authorization Number", "Auth Number", "Authorization #"]) ??
    text.match(/\b(\d{8}[A-Z]{3}\d{6})\b/i)?.[1] ??
    null;
  if (authNum) out.authorization_number = authNum.trim();

  out.authorization_type = fieldAfterLabel(text, ["Authorization Type", "Auth Type"]);
  out.authorization_bill_type = fieldAfterLabel(text, ["Authorization Bill Type", "Bill Type"]);
  out.referral_received_date = normalizeReferralDate(
    fieldAfterLabel(text, ["Date/Time Received", "Date Received", "Received Date"])
  );
  out.requested_soc_date = normalizeReferralDate(
    fieldAfterLabel(text, ["SOC date", "SOC Date", "Start of Care", "Complete Date"])
  );
  out.discharge_date = normalizeReferralDate(fieldAfterLabel(text, ["D/C Date", "Discharge Date", "DC Date"]));
  out.referral_facility = fieldAfterLabel(text, ["Referral Facility", "Facility", "Referral Source"]);
  out.referral_source_name = fieldAfterLabel(text, ["Referral Source", "Referral Taken By"]);

  const clientName = fieldAfterLabel(text, ["Client name", "Client Name", "Patient Name", "Member Name"]);
  if (clientName) {
    const names = parseLastFirstName(clientName);
    out.first_name = names.first_name;
    out.last_name = names.last_name;
    out.full_name = [names.first_name, names.last_name].filter(Boolean).join(" ") || clientName;
  }

  out.sex = fieldAfterLabel(text, ["Sex", "Gender"]);
  const addressBlock = fieldAfterLabel(text, ["Address", "Client Address", "Member Address"]);
  if (addressBlock) {
    const cityStateZip = addressBlock.match(/^(.+?),\s*([A-Za-z .]+),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
    if (cityStateZip) {
      out.address_line_1 = cityStateZip[1]!.trim();
      out.city = cityStateZip[2]!.trim();
      out.state = normalizeReferralState(cityStateZip[3]!);
      out.zip = normalizeReferralZip(cityStateZip[4]!);
    } else {
      out.address_line_1 = addressBlock;
    }
  }

  out.phone = normalizeReferralPhone(fieldAfterLabel(text, ["Phone", "Client Phone", "Member Phone"]));
  const dobRaw = fieldAfterLabel(text, ["DOB", "Date of Birth", "Birth Date"]);
  out.date_of_birth = normalizeReferralDate(dobRaw);
  const ageRaw = fieldAfterLabel(text, ["Age"]);
  out.age = normalizeVisitCount(ageRaw) ?? extractAgeFromDob(out.date_of_birth);
  out.allergies = fieldAfterLabel(text, ["Allergies"]);
  out.ordering_physician_name = fieldAfterLabel(text, ["Ordering Physician", "Ordering Provider"]);
  out.pcp_name = fieldAfterLabel(text, ["PCP", "Primary Care Physician"]);
  out.following_physician_name = fieldAfterLabel(text, ["Following Physician", "Following Provider"]);
  out.chief_complaint = fieldAfterLabel(text, ["Chief Complaint", "Chief Complaint / Onset", "Onset"]);
  out.insurance_name = fieldAfterLabel(text, ["Insurance", "Payer", "Plan Name"]);
  out.member_id = fieldAfterLabel(text, ["Member Number", "Member ID", "Subscriber ID"]);
  out.medicaid_id = fieldAfterLabel(text, ["Medicaid ID", "Medicaid Number"]);
  out.mbi = fieldAfterLabel(text, ["MBI", "Medicare Beneficiary Identifier", "Medicare ID"]);
  out.agency_assigned = fieldAfterLabel(text, ["Agency Assigned", "Assigned Agency"]);
  out.assigned_to_saintly = saintlyAgencyAssigned(out.agency_assigned);
  out.authorization_effective_start = normalizeReferralDate(
    fieldAfterLabel(text, ["Effective Start", "Effective Start Date", "Auth Start"])
  );
  out.authorization_effective_end = normalizeReferralDate(
    fieldAfterLabel(text, ["Effective End", "Effective End Date", "Auth End"])
  );
  out.authorization_status = fieldAfterLabel(text, ["Authorization Status", "Status"]);

  Object.assign(out, parseVisitTable(text));

  const keys = Object.keys(out).filter((k) => {
    const v = out[k as keyof ParsedPatientReferralSuggestions];
    return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  return keys.length >= 3 ? out : null;
}
