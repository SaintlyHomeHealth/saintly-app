import Link from "next/link";
import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { LEAD_DOCUMENT_TYPE_LABELS } from "@/lib/crm/lead-documents-storage";
import { maskMedicareIdentifier } from "@/lib/crm/medicare-mask";
import { maskSsnIdentifier } from "@/lib/crm/ssn-mask";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { SalesAgentRemoveFromListButton } from "@/components/sales-agent/SalesAgentRemoveFromListButton";
import { formatSalesAgentStatus } from "@/lib/sales-agent/sales-agent-lead-metrics";
import {
  DEFAULT_SALES_AGENT_PATHS,
  type SalesAgentPaths,
} from "@/lib/sales-agent/sales-agent-workspace-paths";
import { formatAppDate, formatAppDateTime } from "@/lib/datetime/app-timezone";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import type { StaffProfile } from "@/lib/staff-profile";

type LeadDocRow = {
  id: string;
  document_type: string;
  created_at: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

type Props = {
  staff: StaffProfile;
  leadId: string;
  created?: boolean;
  uploaded?: boolean;
  paths?: SalesAgentPaths;
};

export async function SalesAgentLeadDetail({
  staff,
  leadId,
  created,
  uploaded,
  paths = DEFAULT_SALES_AGENT_PATHS,
}: Props) {
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select(
      `id, status, source, created_at, converted_to_patient_at, medicare_number, social_security_number, insurance_name, insurance_type, insurance_member_id,
       caregiver_name, caregiver_phone_number, caregiver_relationship, reason_for_referral, service_disciplines, service_type,
       referring_doctor_name, doctor_office_name, notes, dob, consent_to_contact, sales_agent_hidden_at,
       contacts ( full_name, primary_phone, email, address_line_1, city, state, zip )`
    )
    .eq("id", leadId)
    .eq("produced_by_sales_agent_id", staff.user_id)
    .is("sales_agent_hidden_at", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.warn("[sales-agent/lead detail]", error.message);
  }
  if (!lead?.id) {
    notFound();
  }

  const contactRaw = lead.contacts;
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;

  const { data: docs } = await supabaseAdmin
    .from("lead_documents")
    .select("id, document_type, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  const docRows = (docs ?? []) as LeadDocRow[];

  const addressParts = [
    contact?.address_line_1,
    [contact?.city, contact?.state].filter(Boolean).join(", "),
    contact?.zip,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <Link href={paths.leads} className="text-sm font-medium text-sky-700 hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-slate-900">{(contact?.full_name ?? "Lead").trim()}</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800">
            {formatSalesAgentStatus(lead.status, lead.converted_to_patient_at)}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Submitted {formatAppDateTime(lead.created_at, "—")} · Source: {formatLeadSourceLabel(lead.source)}
        </p>
      </div>

      {created ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your order was submitted successfully. Intake staff will follow up shortly.
        </div>
      ) : null}

      {lead.converted_to_patient_at ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Converted to patient on {formatAppDateTime(lead.converted_to_patient_at, "—")}.
        </div>
      ) : lead.status !== "dead_lead" && lead.status !== "duplicate_lead" ? (
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Status: {formatSalesAgentStatus(lead.status, lead.converted_to_patient_at)} — conversion is handled by
          Saintly intake staff.
        </div>
      ) : null}

      {uploaded ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Document uploaded successfully.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Patient</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              {contact?.primary_phone ? formatPhoneNumber(contact.primary_phone) : "—"}
            </Field>
            <Field label="Email">{contact?.email?.trim() || "—"}</Field>
            <Field label="Date of birth">
              {lead.dob ? formatAppDate(`${lead.dob}T12:00:00`, "—") : "—"}
            </Field>
            <Field label="Social Security Number">
              {maskSsnIdentifier(lead.social_security_number) || "—"}
            </Field>
            <Field label="Address">{addressParts || "—"}</Field>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Insurance</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Medicare number">{maskMedicareIdentifier(lead.medicare_number) || "—"}</Field>
            <Field label="Insurance type">{lead.insurance_type?.trim() || "—"}</Field>
            <Field label="Insurance name">{lead.insurance_name?.trim() || "—"}</Field>
            <Field label="Member ID">{lead.insurance_member_id?.trim() || "—"}</Field>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Caregiver</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name">{lead.caregiver_name?.trim() || "—"}</Field>
            <Field label="Phone">
              {lead.caregiver_phone_number ? formatPhoneNumber(lead.caregiver_phone_number) : "—"}
            </Field>
            <Field label="Relationship">{lead.caregiver_relationship?.trim() || "—"}</Field>
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Referral</h3>
          <dl className="mt-4 grid gap-3">
            <Field label="Services">
              {(lead.service_disciplines as string[] | null)?.join(", ") || lead.service_type || "—"}
            </Field>
            <Field label="Reason">{lead.reason_for_referral?.trim() || "—"}</Field>
            <Field label="Doctor / PCP">{lead.referring_doctor_name?.trim() || "—"}</Field>
            <Field label="Facility">{lead.doctor_office_name?.trim() || "—"}</Field>
            <Field label="Notes">{lead.notes?.trim() || "—"}</Field>
          </dl>
        </section>
      </div>

      {docRows.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Uploaded cards</h3>
          <ul className="mt-3 space-y-2">
            {docRows.map((doc) => {
              const label =
                LEAD_DOCUMENT_TYPE_LABELS[doc.document_type as keyof typeof LEAD_DOCUMENT_TYPE_LABELS] ??
                doc.document_type;
              return (
                <li key={doc.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-800">{label}</span>
                  <a
                    href={`/api/sales-agent/leads/${leadId}/documents/${doc.id}/file`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sky-700 hover:underline"
                  >
                    View
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <SalesAgentRemoveFromListButton leadId={leadId} />
    </div>
  );
}
