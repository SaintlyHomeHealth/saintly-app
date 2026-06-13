import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";

type LeadSourceContext = {
  source: string | null;
  referral_source: string | null;
  produced_by_source: string | null;
  external_source_metadata: unknown;
  fbclid: string | null;
  converted_patient_id: string | null;
  produced_by_sales_agent_id: string | null;
  produced_by_sales_agent_name?: string | null;
};

function readMetaString(meta: unknown, key: string): string | null {
  if (meta == null || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

export function buildLeadSourceTrail(lead: LeadSourceContext): string[] {
  const trail: string[] = [];
  const meta = lead.external_source_metadata;

  const partnerCampaign = readMetaString(meta, "partner_campaign");
  const partnerSource = readMetaString(meta, "partner_source");
  const formName = readMetaString(meta, "form_name") ?? readMetaString(meta, "intake_form");

  if (partnerCampaign) trail.push(partnerCampaign);
  else if (partnerSource) trail.push(partnerSource);
  else {
    const sourceLabel = formatLeadSourceLabel(lead.source);
    if (sourceLabel !== "—") trail.push(sourceLabel);
  }

  if (formName && !trail.includes(formName)) trail.push(formName);

  const referral = (lead.referral_source ?? "").trim();
  if (referral && !trail.includes(referral)) trail.push(referral);

  if (lead.produced_by_source?.trim()) {
    const produced = lead.produced_by_source.trim();
    if (!trail.includes(produced)) trail.push(produced);
  }

  if (lead.produced_by_sales_agent_id) {
    const agentName = lead.produced_by_sales_agent_name?.trim();
    trail.push(agentName ? `Produced by ${agentName}` : "Sales Agent Order");
  }

  trail.push("CRM Lead");

  if (lead.converted_patient_id) trail.push("Converted to Patient");

  return trail;
}

export function buildPatientSourceTrail(
  patient: { referral_source: string | null; patient_status: string | null },
  leadTrail?: string[] | null
): string[] {
  if (leadTrail && leadTrail.length > 0) {
    return [...leadTrail.filter((s) => s !== "CRM Lead"), "Patient"];
  }
  const trail: string[] = [];
  const referral = (patient.referral_source ?? "").trim();
  if (referral) trail.push(referral);
  trail.push("Patient");
  if (patient.patient_status?.trim()) trail.push(patient.patient_status.trim());
  return trail;
}

export function buildCallSourceTrail(opts: {
  hasLead: boolean;
  hasPatient: boolean;
  hasContact: boolean;
  leadTrail?: string[] | null;
}): string[] {
  if (opts.leadTrail && opts.leadTrail.length > 0) {
    return ["Phone Call", ...opts.leadTrail];
  }
  if (opts.hasPatient) return ["Phone Call", "Patient"];
  if (opts.hasLead) return ["Phone Call", "CRM Lead"];
  if (opts.hasContact) return ["Phone Call", "CRM Contact"];
  return ["Phone Call", "No matching lead yet"];
}

export function buildPrivatePaySourceTrail(opts: {
  leadTrail?: string[] | null;
  hasPatient: boolean;
}): string[] {
  if (opts.leadTrail && opts.leadTrail.length > 0) {
    return [...opts.leadTrail, "Private Pay Invoice"];
  }
  if (opts.hasPatient) return ["Patient", "Private Pay Invoice"];
  return ["Private Pay Invoice"];
}

export function buildFaxSourceTrail(opts: {
  hasLead: boolean;
  hasPatient: boolean;
  leadTrail?: string[] | null;
}): string[] {
  if (opts.leadTrail && opts.leadTrail.length > 0) {
    return [...opts.leadTrail, "Fax"];
  }
  if (opts.hasPatient) return ["Patient", "Fax"];
  if (opts.hasLead) return ["CRM Lead", "Fax"];
  return ["Fax"];
}

export function buildRecruitSourceTrail(source: string | null): string[] {
  const trail: string[] = [];
  if (source?.trim()) trail.push(source.trim());
  trail.push("Recruiting Candidate");
  return trail;
}

export function buildApplicantSourceTrail(): string[] {
  return ["Applicant / Hiring"];
}

export function buildInboundEmailSourceTrail(channelKey: string | null, hasLead: boolean): string[] {
  const trail: string[] = [];
  if (channelKey?.trim()) trail.push(channelKey.trim());
  trail.push("Inbound Email");
  if (hasLead) trail.push("CRM Lead");
  return trail;
}

export function formatMatchedFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    phone: "Matched phone",
    email: "Matched email",
    name: "Matched name",
    medicare: "Matched Medicare number",
    referral_source: "Matched referral source",
    source: "Matched source",
    campaign: "Matched campaign",
    notes: "Matched notes",
    caller_name: "Matched caller name",
    caller_number: "Matched caller number",
    produced_by: "Matched produced by",
    organization: "Matched organization",
    invoice_number: "Matched invoice number",
    subject: "Matched subject",
    title: "Matched title",
    description: "Matched description",
  };
  return labels[field] ?? `Matched ${field.replace(/_/g, " ")}`;
}

export function resolvePrimarySourceLabel(sourceTrail: string[]): string | null {
  const first = sourceTrail.find((s) => s && s !== "—");
  return first ?? null;
}
