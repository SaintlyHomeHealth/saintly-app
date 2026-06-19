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
  /authorization\s+notification/i,
  /authorization\s+number/i,
  /authorization\s+approvals\s+total/i,
  /agency\s+assigned/i,
  /\b\d{8}DOM\d+\b/i,
];

export function isTangoReferralDocument(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\b\d{8}DOM\d+\b/i.test(t)) return true;
  return TANGO_MARKERS.filter((re) => re.test(t)).length >= 1;
}

function fieldAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`${escaped}\\s*[:#\\-]?\\s*([^\\n\\r]{1,240})`, "i"),
      new RegExp(`${escaped}\\s+([^\\n\\r]{1,240})`, "i"),
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m?.[1]) {
        const v = m[1].trim();
        if (v && !/^[:#\-]+$/.test(v)) return v;
      }
    }
  }
  return null;
}

function sectionAfter(text: string, label: string, maxLen = 500): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}[^\\n]{0,120}([\\s\\S]{0,${maxLen}})`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() ?? "";
}

function firstPhoneIn(text: string): string | null {
  const m = text.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
  return m ? normalizeReferralPhone(m[0]) : null;
}

function faxAfterPhoneBlock(text: string): string | null {
  const fax = text.match(/fax\s*[:#]?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/i);
  if (fax) return normalizeReferralPhone(fax[0].replace(/^fax\s*[:#]?\s*/i, ""));
  const phones = [...text.matchAll(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g)];
  if (phones.length >= 2) return normalizeReferralPhone(phones[1]![0]);
  return null;
}

function normalizePersonName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().replace(/\s+/g, " ");
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    return s
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return s;
}

function isPlaceholderPatientName(first: string | null, last: string | null): boolean {
  const f = (first ?? "").trim().toLowerCase();
  const l = (last ?? "").trim().toLowerCase();
  if (!f && !l) return true;
  const blocked = new Set(["name", "first", "last", "first name", "last name"]);
  if (blocked.has(f) || blocked.has(l)) return true;
  if (f === "first" && l === "name") return true;
  if (f === "name" && l === "first") return true;
  if (l === "last" && f === "name") return true;
  if (l === "name" && f === "first") return true;
  return false;
}

function parseLastFirstPatientName(text: string): { first_name: string | null; last_name: string | null; full_name: string | null } {
  const patterns = [
    /\b([A-Z]{2,}),\s*([A-Z]{2,})\b/g,
    /\b([A-Z]{2,}),\s*([A-Z][A-Za-z]+(?:[ \t]+[A-Z][A-Za-z]+)*)\b/g,
    /\b([A-Z][a-z]+),\s*([A-Z][A-Za-z]+(?:[ \t]+[A-Z][A-Za-z]+)*)\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const names = parseLastFirstName(`${match[1]}, ${match[2]}`);
      if (isPlaceholderPatientName(names.first_name, names.last_name)) continue;
      const first_name = normalizePersonName(names.first_name);
      const last_name = normalizePersonName(names.last_name);
      return {
        first_name,
        last_name,
        full_name: [first_name, last_name].filter(Boolean).join(" "),
      };
    }
  }

  const labeled =
    fieldAfterLabel(text, ["Client name", "Client Name", "Patient Name", "Member Name"]) ?? null;
  if (labeled) {
    const names = parseLastFirstName(labeled);
    if (!isPlaceholderPatientName(names.first_name, names.last_name)) {
      const first_name = normalizePersonName(names.first_name);
      const last_name = normalizePersonName(names.last_name);
      return {
        first_name,
        last_name,
        full_name: [first_name, last_name].filter(Boolean).join(" ") || normalizePersonName(labeled),
      };
    }
  }

  return { first_name: null, last_name: null, full_name: null };
}

function parseAddress(text: string): Partial<ParsedPatientReferralSuggestions> {
  const raw =
    fieldAfterLabel(text, ["Address", "Client Address", "Member Address", "Patient Address"]) ??
    text.match(/Address\s*:\s*([^\n]+(?:\n[^\n]+)?)/i)?.[1]?.trim() ??
    null;
  if (!raw) return {};

  const oneLine = raw.replace(/\s+/g, " ").trim();
  const cityStateZip = oneLine.match(/^(.+?),\s*([A-Za-z .'-]+),?\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
  if (cityStateZip) {
    return {
      address_line_1: cityStateZip[1]!.trim(),
      city: cityStateZip[2]!.trim(),
      state: normalizeReferralState(cityStateZip[3]!),
      zip: normalizeReferralZip(cityStateZip[4]!),
    };
  }
  return { address_line_1: oneLine };
}

function parseVisitTable(text: string): Partial<ParsedPatientReferralSuggestions> {
  const out: Partial<ParsedPatientReferralSuggestions> = {};
  const approved: string[] = [];

  const tableSection =
    text.match(/Authorization\s+Approvals\s+Total([\s\S]{0,600})/i)?.[1] ?? text;

  const headerRow = tableSection.match(
    /SN\s+PT\s+OT\s+ST\s+MSW\s+HHA[\s\n\r]+(\d+)[\s\n\r]+(\d+)[\s\n\r]+(\d+)[\s\n\r]+(\d+)[\s\n\r]+(\d+)[\s\n\r]+(\d+)/i
  );
  if (headerRow) {
    const counts = [
      { field: "skilled_nursing_visits" as const, code: "SN", val: headerRow[1] },
      { field: "pt_visits" as const, code: "PT", val: headerRow[2] },
      { field: "ot_visits" as const, code: "OT", val: headerRow[3] },
      { field: "st_visits" as const, code: "ST", val: headerRow[4] },
      { field: "msw_visits" as const, code: "MSW", val: headerRow[5] },
      { field: "hha_visits" as const, code: "HHA", val: headerRow[6] },
    ];
    for (const row of counts) {
      const n = normalizeVisitCount(row.val);
      if (n != null) {
        out[row.field] = n;
        if (n > 0) approved.push(row.code);
      }
    }
  } else {
    const inline = tableSection.match(
      /SN\s+PT\s+OT\s+ST\s+MSW\s+HHA\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i
    );
    if (inline) {
      const counts = [
        { field: "skilled_nursing_visits" as const, code: "SN", val: inline[1] },
        { field: "pt_visits" as const, code: "PT", val: inline[2] },
        { field: "ot_visits" as const, code: "OT", val: inline[3] },
        { field: "st_visits" as const, code: "ST", val: inline[4] },
        { field: "msw_visits" as const, code: "MSW", val: inline[5] },
        { field: "hha_visits" as const, code: "HHA", val: inline[6] },
      ];
      for (const row of counts) {
        const n = normalizeVisitCount(row.val);
        if (n != null) {
          out[row.field] = n;
          if (n > 0) approved.push(row.code);
        }
      }
    } else {
      const rows = [
        { keys: ["SN", "Skilled Nursing", "RN"], field: "skilled_nursing_visits" as const, code: "SN" },
        { keys: ["PT"], field: "pt_visits" as const, code: "PT" },
        { keys: ["OT"], field: "ot_visits" as const, code: "OT" },
        { keys: ["ST", "SLP"], field: "st_visits" as const, code: "ST" },
        { keys: ["MSW"], field: "msw_visits" as const, code: "MSW" },
        { keys: ["HHA", "Aide"], field: "hha_visits" as const, code: "HHA" },
      ];
      for (const row of rows) {
        for (const key of row.keys) {
          const patterns = [
            new RegExp(`\\b${key}\\b[^\\d\\n]{0,40}(\\d{1,4})`, "i"),
            new RegExp(`\\b${key}\\b\\s*[:\\-#]?\\s*(\\d{1,4})`, "i"),
          ];
          for (const re of patterns) {
            const m = text.match(re);
            if (m?.[1]) {
              const n = normalizeVisitCount(m[1]);
              if (n != null) {
                out[row.field] = n;
                if (n > 0) approved.push(row.code);
                break;
              }
            }
          }
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

function mergeTangoPartial(
  base: ParsedPatientReferralSuggestions,
  extra: Partial<ParsedPatientReferralSuggestions> | null
): ParsedPatientReferralSuggestions {
  if (!extra) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function isTangoFormLayout(text: string): boolean {
  return /LAST\s+NAME,\s*FIRST\s+NAME/i.test(text) && /\b\d{8}DOM\d+\b/i.test(text);
}

/** Parse Tango auth PDFs where labels and values are in separate table rows (real Dina export). */
function parseTangoFormBlock(text: string): Partial<ParsedPatientReferralSuggestions> | null {
  if (!isTangoFormLayout(text)) return null;

  const out: Partial<ParsedPatientReferralSuggestions> = {};

  const auth = text.match(/\b(\d{8}DOM\d+)\b/i)?.[1];
  if (auth) out.authorization_number = auth.toUpperCase();

  const dateCluster = text.match(/(\d{2}\/\d{2}\/\d{4})SOC[\s\t]+(\d{2}\/\d{2}\/\d{4})/i);
  if (dateCluster) {
    out.referral_received_date = normalizeReferralDate(dateCluster[1]!);
    out.requested_soc_date = normalizeReferralDate(dateCluster[2]!);
  }

  const dcLine = text.match(/\d{2}\/\d{2}\/\d{4}SOC[\s\t]+\d{2}\/\d{2}\/\d{4}[^\n]*\n(\d{2}\/\d{2}\/\d{4})/i);
  if (dcLine) out.discharge_date = normalizeReferralDate(dcLine[1]!);

  const takenBy = text.match(/\d{2}\/\d{2}\/\d{4}SOC[\s\t]+\d{2}\/\d{2}\/\d{4}[\s\t]+([A-Za-z][A-Za-z .'-]{2,40})/i);
  if (takenBy) out.referral_source_name = takenBy[1]!.trim();

  const facilityPhone = text.match(/\n\((\d{3})\)\s*(\d{3}-\d{4})Hospital/i);
  if (facilityPhone) {
    out.referral_facility = "Hospital";
    out.source_phone = normalizeReferralPhone(`(${facilityPhone[1]}) ${facilityPhone[2]}`);
  }

  const sexLine = text.match(/\n([MF])\n[A-Z]{2,},\s*[A-Z]/);
  if (sexLine) out.sex = sexLine[1]!.toUpperCase();

  const patientName = parseLastFirstPatientName(text);
  out.first_name = patientName.first_name;
  out.last_name = patientName.last_name;
  out.full_name = patientName.full_name;

  const streetLine =
    text.match(/\n(\d+[^\n]*Avenue[^\n]*)\n/i) ??
    text.match(/\n(\d+[^\n]+,\s*,?\s*[A-Za-z .'-]+)\n/i);
  const stateZip = text.match(/\n([A-Z]{2})\s+(\d{5})\n/);
  if (streetLine) {
    const street = streetLine[1]!.replace(/,\s*,/g, ",").trim();
    const cityTail = street.match(/,\s*([A-Za-z .'-]+)$/);
    if (cityTail) {
      out.city = cityTail[1]!.trim();
      out.address_line_1 = street.replace(/,\s*[A-Za-z .'-]+$/, "").trim();
    } else {
      out.address_line_1 = street;
    }
  }
  if (stateZip) {
    out.state = normalizeReferralState(stateZip[1]!);
    out.zip = normalizeReferralZip(stateZip[2]!);
  }

  const patientPhone = text.match(/\n[A-Z]{2}\s+\d{5}\n\((\d{3})\)\s*(\d{3}-\d{4})/i);
  if (patientPhone) out.phone = normalizeReferralPhone(`(${patientPhone[1]}) ${patientPhone[2]}`);

  const dobAge = text.match(/\n(\d{2}\/\d{2}\/\d{4})[\s\t]+(\d{1,3})\n/);
  if (dobAge) {
    out.date_of_birth = normalizeReferralDate(dobAge[1]!);
    out.age = Number(dobAge[2]);
  }

  const physicians = text.match(/\n([A-Z][A-Z\s]{2,40})\t([A-Z][A-Z\s]{2,40})\n/);
  if (physicians) {
    out.ordering_physician_name = normalizePersonName(physicians[1]!.trim());
    out.pcp_name = normalizePersonName(physicians[2]!.trim());
  }

  const phoneFaxBlock = text.match(
    /\n\((\d{3})\)\s*(\d{3}-\d{4})\t\((\d{3})\)\s*(\d{3}-\d{4})\n\((\d{3})\)\s*(\d{3}-\d{4})\t\((\d{3})\)\s*(\d{3}-\d{4})\n/i
  );
  if (phoneFaxBlock) {
    out.ordering_physician_phone = normalizeReferralPhone(`(${phoneFaxBlock[1]}) ${phoneFaxBlock[2]}`);
    out.pcp_phone = normalizeReferralPhone(`(${phoneFaxBlock[3]}) ${phoneFaxBlock[4]}`);
    out.ordering_physician_fax = normalizeReferralPhone(`(${phoneFaxBlock[5]}) ${phoneFaxBlock[6]}`);
    out.pcp_fax = normalizeReferralPhone(`(${phoneFaxBlock[7]}) ${phoneFaxBlock[8]}`);
  }

  const weakness = text.match(/\n(Weakness)\n([A-Z0-9]{4,20})\n/i);
  if (weakness) out.chief_complaint = weakness[1]!;

  const billingBlock = text.match(
    /\nWeakness\n([A-Z0-9]{4,20})\n([A-Za-z][A-Za-z0-9 .&\-]{2,40})\n([^\n]*Saintly Home Health[^\n]*)\n([1-9][A-Z0-9]{10})\n([^\n]+)\n(Fee for Service)/i
  );
  if (billingBlock) {
    out.member_id = billingBlock[1]!.trim();
    out.insurance_name = billingBlock[2]!.trim();
    out.agency_assigned = billingBlock[3]!.trim();
    out.mbi = billingBlock[4]!.toUpperCase();
    out.authorization_type = billingBlock[5]!.trim();
    out.authorization_bill_type = billingBlock[6]!.trim();
  } else if (/\bFee for Service\b/i.test(text)) {
    out.authorization_bill_type = "Fee for Service";
  }

  out.assigned_to_saintly = saintlyAgencyAssigned(out.agency_assigned);

  const snApproved = text.match(/Approved\s+SN\s+(\d+)\s+(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (snApproved) {
    out.skilled_nursing_visits = Number(snApproved[1]);
    out.authorization_effective_start = normalizeReferralDate(snApproved[3]!);
    out.authorization_effective_end = normalizeReferralDate(snApproved[4]!);
    out.approved_disciplines = ["SN"];
    out.pt_visits = 0;
    out.ot_visits = 0;
    out.st_visits = 0;
    out.msw_visits = 0;
    out.hha_visits = 0;
    out.total_authorized_visits = Number(snApproved[1]);
  } else {
    const authDates = text.match(/\b\d{8}DOM\d+\b[\s\t]+(\d{2}\/\d{2}\/\d{4})[\s\t]+(\d{2}\/\d{2}\/\d{4})/i);
    if (authDates) {
      out.authorization_effective_start = normalizeReferralDate(authDates[1]!);
      out.authorization_effective_end = normalizeReferralDate(authDates[2]!);
    }
  }

  return out;
}

function parseTangoLabeledLayout(text: string): Partial<ParsedPatientReferralSuggestions> {
  const out: Partial<ParsedPatientReferralSuggestions> = {};

  const authNum =
    text.match(/\b(\d{8}DOM\d+)\b/i)?.[1] ??
    fieldAfterLabel(text, ["Authorization Number", "Auth Number", "Authorization #", "Authorization Number #"]) ??
    null;
  if (authNum) out.authorization_number = authNum.trim().toUpperCase();

  out.authorization_type = fieldAfterLabel(text, ["Authorization Type", "Auth Type"]);
  out.authorization_bill_type =
    fieldAfterLabel(text, ["Authorization Bill Type", "Bill Type"]) ??
    (/\bfee\s+for\s+service\b/i.test(text) ? "Fee for Service" : null);

  out.referral_received_date = normalizeReferralDate(
    fieldAfterLabel(text, ["Date/Time Received", "Date Received", "Received Date", "Referral Received Date"]) ??
      text.match(/(?:received|referral\s+received)\s*(?:date)?\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ??
      null
  );

  out.requested_soc_date =
    normalizeReferralDate(fieldAfterLabel(text, ["SOC date", "SOC Date", "Start of Care", "Complete Date"])) ??
    normalizeReferralDate(text.match(/\bSOC\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\b/i)?.[1] ?? null) ??
    normalizeReferralDate(text.match(/\bSOC\s*(?:date)?\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ?? null);

  out.discharge_date = normalizeReferralDate(
    fieldAfterLabel(text, ["D/C Date", "Discharge Date", "DC Date", "D/C"]) ??
      text.match(/\bD\/C\s*(?:date)?\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ??
      null
  );

  out.referral_facility = fieldAfterLabel(text, ["Referral Facility", "Facility", "Referral Source"]);
  out.referral_source_name = fieldAfterLabel(text, ["Referral Source", "Referral Taken By"]);

  const patientName = parseLastFirstPatientName(text);
  out.first_name = patientName.first_name;
  out.last_name = patientName.last_name;
  out.full_name = patientName.full_name;

  const sexRaw = fieldAfterLabel(text, ["Sex", "Gender"]);
  if (sexRaw) {
    const sex = sexRaw.match(/\b([MF])\b/i)?.[1] ?? sexRaw.slice(0, 1);
    out.sex = sex?.toUpperCase() ?? sexRaw;
  }

  Object.assign(out, parseAddress(text));

  out.phone =
    normalizeReferralPhone(fieldAfterLabel(text, ["Phone", "Client Phone", "Member Phone", "Patient Phone"])) ??
    firstPhoneIn(sectionAfter(text, "Phone", 120));

  const dobRaw =
    fieldAfterLabel(text, ["DOB", "Date of Birth", "Birth Date"]) ??
    text.match(/\bDOB\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ??
    null;
  out.date_of_birth = normalizeReferralDate(dobRaw);
  const ageRaw = fieldAfterLabel(text, ["Age"]) ?? text.match(/\bAge\s*[:.]?\s*(\d{1,3})\b/i)?.[1] ?? null;
  out.age = normalizeVisitCount(ageRaw) ?? extractAgeFromDob(out.date_of_birth);

  out.allergies = fieldAfterLabel(text, ["Allergies"]);

  const orderingBlock = sectionAfter(text, "Ordering Physician", 400);
  out.ordering_physician_name =
    fieldAfterLabel(text, ["Ordering Physician", "Ordering Provider"]) ??
    orderingBlock.match(/^([A-Za-z][A-Za-z .'-]{2,80})/)?.[1]?.trim() ??
    null;
  out.ordering_physician_phone = firstPhoneIn(orderingBlock) ?? firstPhoneIn(sectionAfter(text, "Ordering Physician", 200));
  out.ordering_physician_fax = faxAfterPhoneBlock(orderingBlock);

  const pcpBlock = sectionAfter(text, "PCP", 400);
  out.pcp_name =
    fieldAfterLabel(text, ["PCP", "Primary Care Physician"]) ??
    pcpBlock.match(/^([A-Za-z][A-Za-z .'-]{2,80})/)?.[1]?.trim() ??
    null;
  out.pcp_phone = firstPhoneIn(pcpBlock);
  out.pcp_fax = faxAfterPhoneBlock(pcpBlock);

  out.following_physician_name = fieldAfterLabel(text, ["Following Physician", "Following Provider"]);

  out.chief_complaint =
    fieldAfterLabel(text, ["Chief Complaint / Onset", "Chief Complaint", "Onset", "Chief complaint / diagnosis"]) ??
    text.match(/(?:chief\s*complaint|diagnosis)\s*(?:text)?\s*[:.]?\s*([A-Za-z][A-Za-z0-9 .,'\-]{1,120})/i)?.[1]?.trim() ??
    null;
  if (out.chief_complaint) {
    out.chief_complaint = out.chief_complaint.replace(/^\/\s*Onset\s*:\s*/i, "").trim();
  }

  out.insurance_name =
    fieldAfterLabel(text, ["Insurance", "Payer", "Plan Name"]) ??
    text.match(/Insurance\s*:\s*([A-Za-z][A-Za-z0-9 .&\-]{2,40})/i)?.[1]?.trim() ??
    null;

  out.member_id =
    fieldAfterLabel(text, ["Member Number", "Member ID", "Member #", "Subscriber ID"]) ??
    text.match(/Member\s*#\s*:?\s*([A-Z0-9]{4,20})/i)?.[1]?.trim() ??
    null;

  out.medicaid_id = fieldAfterLabel(text, ["Medicaid ID", "Medicaid Number"]);

  out.mbi =
    fieldAfterLabel(text, ["MBI", "Medicare Beneficiary Identifier", "Medicare ID"]) ??
    text.match(/MBI\s*:?\s*([1-9][A-Z0-9]{10})/i)?.[1]?.toUpperCase() ??
    text.match(/\b([1-9][A-Z0-9]{10})\b/)?.[1]?.toUpperCase() ??
    null;

  out.agency_assigned = fieldAfterLabel(text, ["Agency Assigned", "Assigned Agency"]);
  out.assigned_to_saintly = saintlyAgencyAssigned(out.agency_assigned);

  out.authorization_effective_start = normalizeReferralDate(
    fieldAfterLabel(text, ["Effective Start", "Effective Start Date", "Auth Start", "Effective From"]) ??
      text.match(/Effective\s+From\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ??
      null
  );
  out.authorization_effective_end = normalizeReferralDate(
    fieldAfterLabel(text, ["Effective End", "Effective End Date", "Auth End", "Effective Through"]) ??
      text.match(/Effective\s+Through\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ??
      null
  );
  out.authorization_status = fieldAfterLabel(text, ["Authorization Status", "Status"]);

  Object.assign(out, parseVisitTable(text));
  return out;
}

export type ParseTangoOptions = {
  force?: boolean;
};

export function parseTangoReferralText(
  text: string,
  options?: ParseTangoOptions
): ParsedPatientReferralSuggestions | null {
  if (!options?.force && !isTangoReferralDocument(text)) return null;

  const base: ParsedPatientReferralSuggestions = {
    referral_source_type: "tango_dina",
    document_type: "tango_authorization",
    intake_status: "New Referral",
    patient_status: "pending",
  };

  const formBlock = parseTangoFormBlock(text);
  if (formBlock) {
    const out = mergeTangoPartial(base, formBlock);
    const keys = Object.keys(out).filter((k) => {
      const v = out[k as keyof ParsedPatientReferralSuggestions];
      return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
    });
    return keys.length >= 3 ? out : null;
  }

  const labeled = parseTangoLabeledLayout(text);
  const out = mergeTangoPartial(base, labeled);

  const keys = Object.keys(out).filter((k) => {
    const v = out[k as keyof ParsedPatientReferralSuggestions];
    return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  return keys.length >= 3 ? out : null;
}
