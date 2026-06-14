"use client";

import { useEffect, useState } from "react";

import type {
  PacketDeliveryMethod,
  PacketPriority,
  PacketRequestSource,
  PacketType,
} from "@/lib/crm/facility-packet-types";
import {
  inferDeliveryMethodFromOutcome,
  PACKET_DELIVERY_LABELS,
  PACKET_TYPES,
  PACKET_TYPE_LABELS,
} from "@/lib/crm/facility-packet-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type ContactOption = { id: string; name: string };
type StaffOption = { user_id: string; label: string };

export type FacilityPacketRequestModalProps = {
  open: boolean;
  onClose: () => void;
  facilityId: string;
  facilityName?: string;
  contactId?: string | null;
  activityId?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  campaignStepInstanceId?: string | null;
  defaultDeliveryMethod?: PacketDeliveryMethod | null;
  defaultRecipient?: { name?: string; role?: string; email?: string; fax?: string; phone?: string };
  defaultNotes?: string;
  defaultOutcome?: string | null;
  source?: PacketRequestSource;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaultAssignedTo?: string | null;
  onCreated?: (id: string) => void;
};

export function FacilityPacketRequestModal({
  open,
  onClose,
  facilityId,
  facilityName,
  contactId: initialContactId,
  activityId,
  leadId,
  campaignId,
  campaignStepInstanceId,
  defaultDeliveryMethod,
  defaultRecipient,
  defaultNotes,
  defaultOutcome,
  source = "manual",
  contacts = [],
  staffOptions = [],
  defaultAssignedTo,
  onCreated,
}: FacilityPacketRequestModalProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<PacketDeliveryMethod>(
    defaultDeliveryMethod ?? inferDeliveryMethodFromOutcome(defaultOutcome) ?? "fax"
  );
  const [packetType, setPacketType] = useState<PacketType>("general_agency_packet");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [recipientName, setRecipientName] = useState(defaultRecipient?.name ?? "");
  const [recipientRole, setRecipientRole] = useState(defaultRecipient?.role ?? "");
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipient?.email ?? "");
  const [recipientFax, setRecipientFax] = useState(defaultRecipient?.fax ?? "");
  const [recipientPhone, setRecipientPhone] = useState(defaultRecipient?.phone ?? "");
  const [assignedTo, setAssignedTo] = useState(defaultAssignedTo ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<PacketPriority>("Normal");
  const [notes, setNotes] = useState(defaultNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDeliveryMethod(defaultDeliveryMethod ?? inferDeliveryMethodFromOutcome(defaultOutcome) ?? "fax");
    setContactId(initialContactId ?? "");
    setRecipientName(defaultRecipient?.name ?? "");
    setRecipientRole(defaultRecipient?.role ?? "");
    setRecipientEmail(defaultRecipient?.email ?? "");
    setRecipientFax(defaultRecipient?.fax ?? "");
    setRecipientPhone(defaultRecipient?.phone ?? "");
    setAssignedTo(defaultAssignedTo ?? "");
    setNotes(defaultNotes ?? "");
    setError(null);
    setDuplicateId(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDueDate(tomorrow.toISOString().slice(0, 16));
  }, [open, defaultDeliveryMethod, defaultOutcome, defaultRecipient, defaultNotes, initialContactId, defaultAssignedTo]);

  useEffect(() => {
    if (!contactId) return;
    const c = contacts.find((x) => x.id === contactId);
    if (c && !recipientName) setRecipientName(c.name);
  }, [contactId, contacts, recipientName]);

  async function submit(force = false) {
    setSaving(true);
    setError(null);
    setDuplicateId(null);
    try {
      const res = await fetch("/api/facilities/packet-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: facilityId,
          contact_id: contactId || null,
          activity_id: activityId ?? null,
          lead_id: leadId ?? null,
          campaign_id: campaignId ?? null,
          campaign_step_instance_id: campaignStepInstanceId ?? null,
          delivery_method: deliveryMethod,
          packet_type: packetType,
          assigned_to: assignedTo || null,
          due_at: dueDate ? new Date(dueDate).toISOString() : null,
          priority,
          recipient_name: recipientName.trim() || null,
          recipient_role: recipientRole.trim() || null,
          recipient_email: recipientEmail.trim() || null,
          recipient_fax: recipientFax.trim() || null,
          recipient_phone: recipientPhone.trim() || null,
          notes: notes.trim() || null,
          source,
          force_create: force,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string; existing_id?: string };
      if (data.error === "duplicate_open" && data.existing_id) {
        setDuplicateId(data.existing_id);
        setError("An open packet request already exists for this facility.");
        return;
      }
      if (!data.ok || !data.id) {
        setError("Could not create packet request.");
        return;
      }
      onCreated?.(data.id);
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const missingContactInfo =
    (deliveryMethod === "fax" && !recipientFax.trim()) ||
    (deliveryMethod === "email" && !recipientEmail.trim());

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Packet request</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{facilityName ?? "New packet request"}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <label className="block text-xs font-semibold uppercase text-slate-500">
            Packet type
            <select value={packetType} onChange={(e) => setPacketType(e.target.value as PacketType)} className={`${crmFilterInputCls} mt-1 w-full`}>
              {PACKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PACKET_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            Delivery method
            <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as PacketDeliveryMethod)} className={`${crmFilterInputCls} mt-1 w-full`}>
              {Object.entries(PACKET_DELIVERY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {contacts.length > 0 ? (
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Contact
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`}>
                <option value="">Select contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient name" className={crmFilterInputCls} />
            <input value={recipientRole} onChange={(e) => setRecipientRole(e.target.value)} placeholder="Role" className={crmFilterInputCls} />
            <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="Email" className={crmFilterInputCls} />
            <input value={recipientFax} onChange={(e) => setRecipientFax(e.target.value)} placeholder="Fax" className={crmFilterInputCls} />
            <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="Phone" className={crmFilterInputCls} />
          </div>
          {missingContactInfo ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Warning: {deliveryMethod === "fax" ? "fax number" : "email"} is missing. You can still create the request.
            </p>
          ) : null}
          {staffOptions.length > 0 ? (
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Assigned to
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`}>
                <option value="">Default rep</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Due
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
            </label>
            <label className="block text-xs font-semibold uppercase text-slate-500">
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as PacketPriority)} className={`${crmFilterInputCls} mt-1 w-full`}>
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
              </select>
            </label>
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Notes" className={`${crmFilterInputCls} w-full`} />
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
              {duplicateId ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={`/admin/facilities/packets?facility_id=${facilityId}`} className="text-xs font-semibold text-sky-800 underline">
                    Open existing
                  </a>
                  <button type="button" onClick={() => void submit(true)} className="text-xs font-semibold text-violet-800 underline">
                    Create anyway
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
            Cancel
          </button>
          <button type="button" disabled={saving} onClick={() => void submit()} className="flex-[2] rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Creating…" : "Create Packet Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
