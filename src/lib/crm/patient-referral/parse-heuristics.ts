import "server-only";

import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";

import type { ParsedPatientReferralSuggestions } from "./types";
import {
  extractAgeFromDob,
  normalizeReferralDate,
  normalizeReferralPhone,
  normalizeReferralState,
  normalizeReferralZip,
  parseLastFirstName,
  saintlyAgencyAssigned,
} from "./normalize";
import { parseTangoReferralText, isTangoReferralDocument } from "./parse-tango";

const MAX_TEXT = 80_000;

function str(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    return m ? Number(m[0]) : null;
  }
  return null;
}

function parseHeuristicReferralText(text: string): ParsedPatientReferralSuggestions {
  const out: ParsedPatientReferralSuggestions = {
    intake_status: "New Referral",
    patient_status: "pending",
  };

  const nameMatch =
    text.match(/(?:patient|client|member)\s*name\s*[:\-]?\s*([^\n\r]{2,80})/i) ??
    text.match(/\b([A-Z][A-Za-z\-']+,\s*[A-Z][A-Za-z\-']+)\b/);
  if (nameMatch?.[1]) {
    const names = parseLastFirstName(nameMatch[1]);
    out.first_name = names.first_name;
    out.last_name = names.last_name;
    out.full_name = [names.first_name, names.last_name].filter(Boolean).join(" ");
  }

  const dobMatch = text.match(/(?:dob|date of birth|birth\s*date)\s*[:\-]?\s*([^\n\r]{6,20})/i);
  if (dobMatch?.[1]) out.date_of_birth = normalizeReferralDate(dobMatch[1]);

  const phoneMatch = text.match(/(?:phone|tel|cell)\s*[:\-]?\s*([\d().\-\s+]{7,20})/i);
  if (phoneMatch?.[1]) out.phone = normalizeReferralPhone(phoneMatch[1]);

  const mbiMatch = text.match(/\b([1-9][A-Z0-9]{10})\b/);
  if (mbiMatch?.[1] && /[A-Z]/i.test(mbiMatch[1])) out.mbi = mbiMatch[1].toUpperCase();

  const authMatch = text.match(/authorization\s*(?:number|#)\s*[:\-]?\s*([A-Z0-9]{8,20})/i);
  if (authMatch?.[1]) out.authorization_number = authMatch[1].trim();

  const insuranceMatch = text.match(/(?:insurance|payer|plan)\s*[:\-]?\s*([^\n\r]{2,60})/i);
  if (insuranceMatch?.[1]) out.insurance_name = insuranceMatch[1].trim();

  const physicianMatch = text.match(/(?:ordering\s*physician|referring\s*physician|md)\s*[:\-]?\s*([^\n\r]{2,80})/i);
  if (physicianMatch?.[1]) out.ordering_physician_name = physicianMatch[1].trim();

  const complaintMatch = text.match(/(?:chief\s*complaint|diagnosis|dx)\s*[:\-]?\s*([^\n\r]{2,120})/i);
  if (complaintMatch?.[1]) out.chief_complaint = complaintMatch[1].trim();

  if (out.date_of_birth) out.age = extractAgeFromDob(out.date_of_birth);

  if (isTangoReferralDocument(text)) {
    out.referral_source_type = "tango_dina";
    out.document_type = "tango_authorization";
  }

  return out;
}

function mergeSuggestions(
  base: ParsedPatientReferralSuggestions,
  extra: ParsedPatientReferralSuggestions | null
): ParsedPatientReferralSuggestions {
  if (!extra) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const key = k as keyof ParsedPatientReferralSuggestions;
    if (out[key] == null || out[key] === "") {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

function parseAiExtraction(raw: unknown): ParsedPatientReferralSuggestions | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const patient = (o.patient && typeof o.patient === "object" ? o.patient : {}) as Record<string, unknown>;
  const payer = (o.payer && typeof o.payer === "object" ? o.payer : {}) as Record<string, unknown>;
  const provider = (o.provider && typeof o.provider === "object" ? o.provider : {}) as Record<string, unknown>;
  const auth = (o.authorization && typeof o.authorization === "object" ? o.authorization : {}) as Record<string, unknown>;
  const visits = (o.visits && typeof o.visits === "object" ? o.visits : {}) as Record<string, unknown>;

  const first = str(patient.first_name, 80);
  const last = str(patient.last_name, 80);
  const full = str(patient.full_name, 120) ?? (first && last ? `${first} ${last}` : null);

  const agency = str(o.agency_assigned, 120);
  return {
    first_name: first,
    last_name: last,
    full_name: full,
    date_of_birth: normalizeReferralDate(str(patient.dob, 20)),
    phone: normalizeReferralPhone(str(patient.phone, 40)),
    address_line_1: str(patient.address_line_1, 200) ?? str(patient.address, 200),
    city: str(patient.city, 80),
    state: normalizeReferralState(str(patient.state, 10)),
    zip: normalizeReferralZip(str(patient.zip, 12)),
    sex: str(patient.sex, 20),
    allergies: str(patient.allergies, 500),
    chief_complaint: str(o.chief_complaint, 300) ?? str(o.diagnosis_text, 300),
    diagnosis_text: str(o.diagnosis_text, 500),
    insurance_name: str(payer.name, 120),
    member_id: str(payer.member_id, 80),
    medicaid_id: str(payer.medicaid_id, 80),
    mbi: str(payer.mbi, 20),
    payer_type: str(payer.plan_type, 80),
    ordering_physician_name: str(provider.ordering_provider_name, 120),
    ordering_physician_phone: normalizeReferralPhone(str(provider.phone, 40)),
    ordering_physician_fax: normalizeReferralPhone(str(provider.fax, 40)),
    referral_facility: str(provider.practice_name, 200),
    authorization_number: str(auth.authorization_number, 40),
    authorization_type: str(auth.authorization_type, 80),
    authorization_bill_type: str(auth.bill_type, 80),
    authorization_effective_start: normalizeReferralDate(str(auth.effective_start, 20)),
    authorization_effective_end: normalizeReferralDate(str(auth.effective_end, 20)),
    requested_soc_date: normalizeReferralDate(str(o.soc_date, 20)),
    discharge_date: normalizeReferralDate(str(o.discharge_date, 20)),
    skilled_nursing_visits: num(visits.sn ?? visits.skilled_nursing),
    pt_visits: num(visits.pt),
    ot_visits: num(visits.ot),
    st_visits: num(visits.st),
    msw_visits: num(visits.msw),
    hha_visits: num(visits.hha),
    agency_assigned: agency,
    assigned_to_saintly: saintlyAgencyAssigned(agency),
    notes: str(o.notes, 2000),
    intake_status: "New Referral",
    patient_status: "pending",
    document_type: str(o.document_type, 40) as ParsedPatientReferralSuggestions["document_type"],
  };
}

function buildAiSystemPrompt(): string {
  return `You extract home health patient referral fields from document text for Saintly Home Health CRM.
Return ONLY valid JSON with keys: document_type, patient {first_name,last_name,dob,phone,address,address_line_1,city,state,zip,sex,allergies},
payer {name,member_id,medicaid_id,mbi,plan_type}, provider {ordering_provider_name,practice_name,phone,fax},
authorization {authorization_number,authorization_type,bill_type,effective_start,effective_end},
visits {sn,pt,ot,st,msw,hha}, soc_date, discharge_date, chief_complaint, diagnosis_text, agency_assigned, notes.
Use YYYY-MM-DD for dates. Be conservative; leave fields empty when uncertain.`;
}

export type ParsePatientReferralResult = {
  suggestions: ParsedPatientReferralSuggestions | null;
  isTangoDocument: boolean;
  parseNotes: string[];
  confidenceWarnings: string[];
  usedAi: boolean;
};

export async function parsePatientReferralText(
  text: string,
  options?: { referralSourceType?: string | null; useAi?: boolean }
): Promise<ParsePatientReferralResult> {
  const trimmed = text.trim().slice(0, MAX_TEXT);
  const parseNotes: string[] = [];
  const confidenceWarnings: string[] = [];
  let usedAi = false;

  if (!trimmed || trimmed.length < 20) {
    return { suggestions: null, isTangoDocument: false, parseNotes: ["Document text too short"], confidenceWarnings, usedAi };
  }

  const forceTango = options?.referralSourceType === "tango_dina";
  const isTango = forceTango || isTangoReferralDocument(trimmed);
  let suggestions: ParsedPatientReferralSuggestions = parseHeuristicReferralText(trimmed);

  if (isTango) {
    const tango = parseTangoReferralText(trimmed, { force: forceTango });
    if (tango) {
      suggestions = mergeSuggestions(tango, suggestions);
      parseNotes.push("Applied Tango/Dina-specific parsing.");
    }
  }

  const fieldCount = Object.values(suggestions).filter((v) => v != null && v !== "").length;
  const weak = fieldCount < 4;

  if (weak && options?.useAi !== false && process.env.OPENAI_API_KEY?.trim()) {
    const aiRaw = await fetchCrmOpenAiJsonObject(
      process.env.SAINTLY_PATIENT_REFERRAL_AI_MODEL?.trim() || saintlyCrmTaskExtractionModel(),
      buildAiSystemPrompt(),
      trimmed
    );
    const aiParsed = parseAiExtraction(aiRaw);
    if (aiParsed) {
      suggestions = mergeSuggestions(suggestions, aiParsed);
      usedAi = true;
      parseNotes.push("Applied AI extraction for missing fields.");
      confidenceWarnings.push("AI-extracted fields should be verified.");
    }
  }

  if (options?.referralSourceType?.trim()) {
    suggestions.referral_source_type = options.referralSourceType as ParsedPatientReferralSuggestions["referral_source_type"];
  }

  if (!suggestions.first_name && !suggestions.last_name && suggestions.full_name) {
    const names = parseLastFirstName(suggestions.full_name);
    suggestions.first_name = names.first_name;
    suggestions.last_name = names.last_name;
  }

  if (!suggestions.full_name && (suggestions.first_name || suggestions.last_name)) {
    suggestions.full_name = [suggestions.first_name, suggestions.last_name].filter(Boolean).join(" ");
  }

  if (!suggestions.first_name) confidenceWarnings.push("First name not detected — enter manually.");
  if (!suggestions.last_name) confidenceWarnings.push("Last name not detected — enter manually.");
  if (!suggestions.phone && !suggestions.address_line_1) {
    confidenceWarnings.push("Phone or address not detected — enter manually.");
  }

  const finalCount = Object.values(suggestions).filter((v) => v != null && v !== "").length;
  return {
    suggestions: finalCount >= 2 ? suggestions : null,
    isTangoDocument: isTango,
    parseNotes,
    confidenceWarnings,
    usedAi,
  };
}
