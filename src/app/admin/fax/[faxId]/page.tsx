import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  archiveFaxAction,
  assignFaxOwnerAction,
  attachFaxRecordAction,
  createLeadFromFaxAction,
  markFaxReadAction,
  updateFaxCategoryAction,
  updateFaxTagsAction,
} from "@/app/admin/fax/actions";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import { missingFaxSchema, signedFaxPdfUrl, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type FaxEventRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type StaffOption = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function categoryLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function personLabel(row: Record<string, unknown>): string {
  const fullName = typeof row.full_name === "string" ? row.full_name : "";
  if (fullName.trim()) return fullName.trim();
  const first = typeof row.first_name === "string" ? row.first_name : "";
  const last = typeof row.last_name === "string" ? row.last_name : "";
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || "Unnamed";
}

function staffLabel(staff: StaffOption | undefined): string {
  if (!staff) return "Unassigned";
  return staff.full_name?.trim() || staff.email?.trim() || staff.user_id.slice(0, 8);
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

export default async function AdminFaxDetailPage({ params }: { params: Promise<{ faxId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");

  const { faxId } = await params;
  if (!faxId) notFound();

  const { data, error } = await supabaseAdmin.from("fax_messages").select("*").eq("id", faxId).maybeSingle();
  if (missingFaxSchema(error)) redirect("/admin/fax");
  if (error || !data?.id) notFound();
  const fax = data as FaxMessageRow;

  const [eventsRes, staffRes, leadsRes, patientsRes, facilitiesRes] = await Promise.all([
    supabaseAdmin.from("fax_events").select("*").eq("fax_message_id", fax.id).order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("staff_profiles").select("user_id, email, full_name").order("email", { ascending: true }),
    supabaseAdmin.from("leads").select("id, contacts(full_name, first_name, last_name)").order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("patients").select("id, contacts(full_name, first_name, last_name)").order("created_at", { ascending: false }).limit(100),
    supabaseAdmin.from("facilities").select("id, name").order("name", { ascending: true }).limit(200),
  ]);

  const events = (eventsRes.data ?? []) as FaxEventRow[];
  const staffOptions = (staffRes.data ?? []) as StaffOption[];
  const assigned = staffOptions.find((option) => option.user_id === fax.assigned_to_user_id);
  const leadOptions = (leadsRes.data ?? []) as { id: string; contacts: Record<string, unknown> | Record<string, unknown>[] | null }[];
  const patientOptions = (patientsRes.data ?? []) as { id: string; contacts: Record<string, unknown> | Record<string, unknown>[] | null }[];
  const facilityOptions = (facilitiesRes.data ?? []) as { id: string; name: string | null }[];
  const pdfUrl = await signedFaxPdfUrl(fax.storage_path) ?? fax.pdf_url ?? fax.media_url;
  const returnTo = `/admin/fax/${fax.id}`;
  const matched = fax.patient_id ? "Patient" : fax.lead_id ? "Lead" : fax.facility_id ? "Facility" : "Unassigned";

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Fax detail"
        title={fax.subject || `${fax.direction === "inbound" ? "Inbound" : "Outbound"} fax`}
        metaLine={`${formatPhoneForDisplay(fax.from_number)} to ${formatPhoneForDisplay(fax.to_number)} · ${formatDateTime(fax.received_at ?? fax.sent_at ?? fax.created_at)}`}
        description="Review the PDF, attach it to the right record, and keep a clear audit trail."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/fax" className={crmPrimaryCtaCls}>
              All faxes
            </Link>
            {pdfUrl ? (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className={crmActionBtnSky}>
                Download / print PDF
              </a>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
            <p className="text-sm font-bold text-slate-900">PDF Preview</p>
          </div>
          {pdfUrl ? (
            <iframe src={pdfUrl} title="Fax PDF preview" className="h-[760px] w-full bg-slate-100" />
          ) : (
            <div className="flex h-[520px] items-center justify-center p-8 text-center text-sm text-slate-500">
              No PDF available.
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">Fax metadata</p>
                <p className="mt-1 text-xs text-slate-500">Matched record: {matched}</p>
              </div>
              {!fax.is_read && fax.direction === "inbound" ? (
                <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">Unread</span>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Status" value={fax.status} />
              <Field label="Category" value={categoryLabel(fax.category)} />
              <Field label="From" value={formatPhoneForDisplay(fax.from_number)} />
              <Field label="To" value={formatPhoneForDisplay(fax.to_number)} />
              <Field label="Pages" value={fax.page_count} />
              <Field label="Assigned" value={staffLabel(assigned)} />
              <Field label="Received" value={formatDateTime(fax.received_at)} />
              <Field label="Completed" value={formatDateTime(fax.completed_at)} />
            </div>
            {fax.failure_reason ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {fax.failure_reason}
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Actions</p>
            <div className="mt-4 grid gap-3">
              <form action={markFaxReadAction}>
                <input type="hidden" name="faxId" value={fax.id} />
                <input type="hidden" name="isRead" value={fax.is_read ? "0" : "1"} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" className={crmActionBtnMuted}>
                  Mark {fax.is_read ? "unread" : "read"}
                </button>
              </form>
              <form action={archiveFaxAction}>
                <input type="hidden" name="faxId" value={fax.id} />
                <input type="hidden" name="archived" value={fax.is_archived ? "0" : "1"} />
                <input type="hidden" name="returnTo" value={fax.is_archived ? returnTo : "/admin/fax"} />
                <button type="submit" className={crmActionBtnMuted}>
                  {fax.is_archived ? "Unarchive" : "Archive"}
                </button>
              </form>
              <form action={updateFaxCategoryAction} className="flex items-end gap-2">
                <input type="hidden" name="faxId" value={fax.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-slate-600">
                  Change category
                  <select name="category" defaultValue={fax.category} className={crmFilterInputCls}>
                    <option value="referral">Referral</option>
                    <option value="orders">Orders</option>
                    <option value="signed_docs">Signed Docs</option>
                    <option value="insurance">Insurance</option>
                    <option value="marketing">Marketing</option>
                    <option value="misc">Misc</option>
                  </select>
                </label>
                <button type="submit" className={crmActionBtnSky}>Save</button>
              </form>
              <form action={assignFaxOwnerAction} className="flex items-end gap-2">
                <input type="hidden" name="faxId" value={fax.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-slate-600">
                  Assign to user
                  <select name="assigned_to_user_id" defaultValue={fax.assigned_to_user_id ?? ""} className={crmFilterInputCls}>
                    <option value="">Unassigned</option>
                    {staffOptions.map((option) => (
                      <option key={option.user_id} value={option.user_id}>
                        {staffLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={crmActionBtnSky}>Assign</button>
              </form>
              <form action={updateFaxTagsAction} className="flex items-end gap-2">
                <input type="hidden" name="faxId" value={fax.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-slate-600">
                  Tags
                  <input name="tags" defaultValue={(fax.tags ?? []).join(", ")} placeholder="needs follow-up, urgent" className={crmFilterInputCls} />
                </label>
                <button type="submit" className={crmActionBtnSky}>Save</button>
              </form>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Smart matching panel</p>
            <p className="mt-1 text-xs text-slate-500">Number matching runs automatically on inbound fax. Manual attach is available until OCR matching is added.</p>
            <form action={attachFaxRecordAction} className="mt-4 grid gap-2">
              <input type="hidden" name="faxId" value={fax.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <select name="match_kind" className={crmFilterInputCls}>
                <option value="lead">Lead</option>
                <option value="patient">Patient</option>
                <option value="facility">Facility / referral source</option>
              </select>
              <select name="match_id" className={crmFilterInputCls}>
                <optgroup label="Leads">
                  {leadOptions.map((lead) => {
                    const contact = Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts;
                    return <option key={`lead-${lead.id}`} value={`lead:${lead.id}`}>{personLabel(contact ?? {})}</option>;
                  })}
                </optgroup>
                <optgroup label="Patients">
                  {patientOptions.map((patient) => {
                    const contact = Array.isArray(patient.contacts) ? patient.contacts[0] : patient.contacts;
                    return <option key={`patient-${patient.id}`} value={`patient:${patient.id}`}>{personLabel(contact ?? {})}</option>;
                  })}
                </optgroup>
                <optgroup label="Facilities">
                  {facilityOptions.map((facility) => (
                    <option key={`facility-${facility.id}`} value={`facility:${facility.id}`}>{facility.name ?? "Unnamed facility"}</option>
                  ))}
                </optgroup>
              </select>
              <button type="submit" className={crmActionBtnSky}>Attach selected record</button>
            </form>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Referral workflow</p>
            {fax.category === "referral" || (!fax.lead_id && !fax.patient_id) ? (
              <details className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
                <summary className="cursor-pointer text-sm font-bold text-sky-900">Create Lead from Fax</summary>
                <form action={createLeadFromFaxAction} className="mt-4 grid gap-2">
                  <input type="hidden" name="faxId" value={fax.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <input name="firstName" placeholder="Patient first name" className={crmFilterInputCls} required />
                    <input name="lastName" placeholder="Patient last name" className={crmFilterInputCls} required />
                  </div>
                  <input name="dob" type="date" className={crmFilterInputCls} />
                  <input name="phone" placeholder="Phone" className={crmFilterInputCls} />
                  <input name="address" placeholder="Address" className={crmFilterInputCls} />
                  <input name="insurance" placeholder="Insurance" className={crmFilterInputCls} />
                  <input name="doctor" placeholder="Doctor / referral source" className={crmFilterInputCls} />
                  <textarea name="notes" placeholder="Notes" className={`${crmFilterInputCls} min-h-24`} />
                  <button type="submit" className={crmPrimaryCtaCls}>Create Lead from Fax</button>
                </form>
              </details>
            ) : (
              <p className="mt-2 text-sm text-slate-500">This fax is already attached to an existing record.</p>
            )}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">One-click follow-up</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={crmActionBtnMuted} disabled>Fax signature request</button>
              <button type="button" className={crmActionBtnMuted} disabled>Fax referral received confirmation</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Templates are stubbed until the document template system is connected.</p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-900">Audit timeline</p>
            <div className="mt-4 space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No audit events recorded yet.</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{event.event_type.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
