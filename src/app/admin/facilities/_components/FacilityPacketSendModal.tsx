"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PacketReferralLinkPanel,
  type PacketReferralLinkInfo,
} from "@/app/admin/facilities/_components/PacketReferralLinkPanel";
import type {
  PacketDeliveryAttemptRow,
  PacketMaterialRow,
  PacketRequestCard,
  PacketSendDeliveryMethod,
} from "@/lib/crm/facility-packet-types";
import { PACKET_TYPE_LABELS } from "@/lib/crm/facility-packet-types";
import {
  appendReferralLinkToEmailMessage,
  appendReferralLinkToFaxCover,
  removeReferralLinkFromText,
} from "@/lib/crm/packet-referral-link-message";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type DeliveryConfig = { emailConfigured: boolean; faxConfigured: boolean };

type FacilityPacketSendModalProps = {
  request: PacketRequestCard;
  onDone?: () => void;
  className?: string;
};

const DEFAULT_SUBJECT = "Saintly Home Health Referral Packet";

function defaultEmailMessage(recipientName?: string | null): string {
  const greeting = recipientName?.trim() ? `Hello ${recipientName.trim()},` : "Hello,";
  return `${greeting}

Thank you for speaking with us. Attached is the Saintly Home Health packet for your office.

Please let us know if you need anything else or if there is a specific referral process we should follow.

Thank you,
Saintly Home Health`;
}

function defaultCoverSheet(recipientName?: string | null, facilityName?: string): string {
  const to = [recipientName, facilityName].filter(Boolean).join(" · ") || "Recipient";
  return `To: ${to}
From: Saintly Home Health
Subject: Saintly Home Health Referral Packet

Please see attached packet. Thank you.`;
}

function inferSendMethod(request: PacketRequestCard): PacketSendDeliveryMethod {
  if (request.delivery_method === "email") return "email";
  if (request.delivery_method === "fax") return "fax";
  return "manual";
}

export function FacilityPacketSendModal({ request, onDone, className }: FacilityPacketSendModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [config, setConfig] = useState<DeliveryConfig>({ emailConfigured: false, faxConfigured: false });
  const [materials, setMaterials] = useState<PacketMaterialRow[]>([]);
  const [method, setMethod] = useState<PacketSendDeliveryMethod>(inferSendMethod(request));
  const [recipientEmail, setRecipientEmail] = useState(request.recipient_email ?? "");
  const [recipientFax, setRecipientFax] = useState(request.recipient_fax ?? "");
  const [recipientName, setRecipientName] = useState(request.recipient_name ?? "");
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(defaultEmailMessage(request.recipient_name));
  const [coverSheet, setCoverSheet] = useState(defaultCoverSheet(request.recipient_name, request.facility_name));
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [createFollowUp, setCreateFollowUp] = useState(true);
  const [manualNotes, setManualNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phiWarning, setPhiWarning] = useState(false);
  const [referralLink, setReferralLink] = useState<PacketReferralLinkInfo | null>(null);
  const [referralLinkLoading, setReferralLinkLoading] = useState(false);
  const [referralLinkError, setReferralLinkError] = useState<string | null>(null);
  const [includeReferralLink, setIncludeReferralLink] = useState(true);

  const loadReferralLink = useCallback(
    async (materialIds: string[], deliveryMethod: PacketSendDeliveryMethod) => {
      setReferralLinkLoading(true);
      setReferralLinkError(null);
      try {
        const res = await fetch(`/api/facilities/packet-requests/${request.id}/referral-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            material_ids: materialIds,
            delivery_method: deliveryMethod === "manual" ? request.delivery_method : deliveryMethod,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          link?: { id: string; public_url: string; token_segment: string };
        };
        if (!data.ok || !data.link) {
          setReferralLinkError("Could not load referral link.");
          setReferralLink(null);
          return;
        }
        setReferralLink({
          source_link_id: data.link.id,
          public_url: data.link.public_url,
          token_segment: data.link.token_segment,
        });
      } catch {
        setReferralLinkError("Network error loading referral link.");
      } finally {
        setReferralLinkLoading(false);
      }
    },
    [request.delivery_method, request.id]
  );

  const loadData = useCallback(async () => {
    const [configRes, materialsRes] = await Promise.all([
      fetch("/api/facilities/packet-delivery/config"),
      fetch("/api/facilities/packet-materials"),
    ]);
    const configJson = (await configRes.json()) as DeliveryConfig & { ok?: boolean };
    const materialsJson = (await materialsRes.json()) as { ok: boolean; materials?: PacketMaterialRow[] };
    if (configJson.ok !== false) {
      setConfig({ emailConfigured: configJson.emailConfigured, faxConfigured: configJson.faxConfigured });
    }
    const mats = materialsJson.materials ?? [];
    setMaterials(mats);
    const suggested = mats.filter((m) =>
      request.packet_type ? m.packet_type === request.packet_type : m.packet_type === "general_agency_packet"
    );
    if (suggested.length) setSelectedMaterialIds(suggested.map((m) => m.id));
    else if (request.material_ids?.length) setSelectedMaterialIds(request.material_ids);
  }, [request.material_ids, request.packet_type]);

  useEffect(() => {
    if (open) void loadData();
  }, [open, loadData]);

  useEffect(() => {
    if (!open) return;
    void loadReferralLink(selectedMaterialIds, method);
  }, [open, loadReferralLink, method, selectedMaterialIds]);

  useEffect(() => {
    if (!referralLink?.public_url) return;
    if (method === "email") {
      setMessage((prev) => {
        const without = removeReferralLinkFromText(prev, referralLink.public_url);
        return includeReferralLink
          ? appendReferralLinkToEmailMessage(without, referralLink.public_url)
          : without;
      });
    } else if (method === "fax") {
      setCoverSheet((prev) => {
        const without = removeReferralLinkFromText(prev, referralLink.public_url);
        return includeReferralLink
          ? appendReferralLinkToFaxCover(without, referralLink.public_url)
          : without;
      });
    }
  }, [includeReferralLink, method, referralLink?.public_url]);

  useEffect(() => {
    if (method === "email" || method === "fax") setIncludeReferralLink(true);
  }, [method]);

  const selectedMaterials = useMemo(
    () => materials.filter((m) => selectedMaterialIds.includes(m.id)),
    [materials, selectedMaterialIds]
  );

  const missingRecipient =
    (method === "email" && !recipientEmail.trim()) || (method === "fax" && !recipientFax.trim());

  const methodUnavailable =
    (method === "email" && !config.emailConfigured) || (method === "fax" && !config.faxConfigured);

  function toggleMaterial(id: string) {
    setSelectedMaterialIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function checkPhi(text: string) {
    const lower = text.toLowerCase();
    setPhiWarning(/\b(dob|date of birth|ssn|social security|patient name|mrn|medical record)\b/.test(lower));
  }

  async function submitSend() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/packet-requests/${request.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_method: method,
          recipient_email: recipientEmail.trim() || null,
          recipient_fax: recipientFax.trim() || null,
          recipient_name: recipientName.trim() || null,
          subject,
          message,
          cover_sheet: coverSheet,
          material_ids: selectedMaterialIds,
          create_follow_up: createFollowUp,
          sent_notes: manualNotes.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; code?: string };
      if (!data.ok) {
        setError(data.message ?? "Send failed.");
        return;
      }
      setOpen(false);
      setStep("edit");
      onDone?.();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Send Packet
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              {step === "preview" ? "Preview & confirm send" : "Send packet"}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{request.facility_name}</p>

            {step === "edit" ? (
              <>
                <fieldset className="mt-4">
                  <legend className="text-xs font-semibold uppercase text-slate-500">Delivery method</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["email", "fax", "manual"] as PacketSendDeliveryMethod[]).map((m) => (
                      <label key={m} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                        <input type="radio" name="send-method" checked={method === m} onChange={() => setMethod(m)} />
                        {m === "email" ? "Email" : m === "fax" ? "Fax" : "Manual"}
                      </label>
                    ))}
                  </div>
                  {method === "email" && !config.emailConfigured ? (
                    <p className="mt-2 text-sm text-amber-800">Email sending is not configured. Use Manual or Mark Sent.</p>
                  ) : null}
                  {method === "fax" && !config.faxConfigured ? (
                    <p className="mt-2 text-sm text-amber-800">Fax sending is not configured. Use Manual or Mark Sent.</p>
                  ) : null}
                  {missingRecipient && method !== "manual" ? (
                    <p className="mt-2 text-sm text-rose-700">
                      No {method} found. Add recipient details or use manual mark sent.
                    </p>
                  ) : null}
                </fieldset>

                {method === "email" ? (
                  <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                    To
                    <input
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className={`${crmFilterInputCls} mt-1 w-full`}
                    />
                  </label>
                ) : null}

                {method === "fax" ? (
                  <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                    Fax number
                    <input
                      value={recipientFax}
                      onChange={(e) => setRecipientFax(e.target.value)}
                      className={`${crmFilterInputCls} mt-1 w-full`}
                    />
                  </label>
                ) : null}

                <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                  Recipient name
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className={`${crmFilterInputCls} mt-1 w-full`}
                  />
                </label>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-slate-500">Packet materials</p>
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {materials.length === 0 ? (
                      <p className="text-sm text-slate-500">No active materials. Admins can add materials in the Materials tab.</p>
                    ) : (
                      materials.map((m) => (
                        <label key={m.id} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedMaterialIds.includes(m.id)}
                            onChange={() => toggleMaterial(m.id)}
                          />
                          <span>
                            {m.name}
                            {m.packet_type ? (
                              <span className="ml-1 text-xs text-slate-500">({PACKET_TYPE_LABELS[m.packet_type]})</span>
                            ) : null}
                            {!m.storage_path && m.external_url ? (
                              <span className="ml-1 text-xs text-sky-700">link</span>
                            ) : null}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {method === "email" ? (
                  <>
                    <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                      Subject
                      <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
                    </label>
                    <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                      Message
                      <textarea
                        value={message}
                        onChange={(e) => {
                          setMessage(e.target.value);
                          checkPhi(e.target.value);
                        }}
                        rows={6}
                        className={`${crmFilterInputCls} mt-1 w-full`}
                      />
                    </label>
                  </>
                ) : null}

                {method === "fax" ? (
                  <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                    Cover sheet note
                    <textarea
                      value={coverSheet}
                      onChange={(e) => {
                        setCoverSheet(e.target.value);
                        checkPhi(e.target.value);
                      }}
                      rows={6}
                      className={`${crmFilterInputCls} mt-1 w-full font-mono text-xs`}
                    />
                  </label>
                ) : null}

                {method === "manual" ? (
                  <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                    Notes (optional)
                    <textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} rows={3} className={`${crmFilterInputCls} mt-1 w-full`} />
                  </label>
                ) : null}

                {phiWarning ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Do not include patient PHI unless using an approved secure channel.
                  </p>
                ) : null}

                <PacketReferralLinkPanel
                  link={referralLink}
                  loading={referralLinkLoading}
                  error={referralLinkError}
                  includeInMessage={includeReferralLink}
                  onIncludeChange={setIncludeReferralLink}
                  showIncludeToggle={method === "email" || method === "fax"}
                />

                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={createFollowUp} onChange={(e) => setCreateFollowUp(e.target.checked)} />
                  Create follow-up task to confirm receipt tomorrow
                </label>
              </>
            ) : (
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p>
                  <span className="font-semibold">Method:</span> {method}
                </p>
                <p>
                  <span className="font-semibold">Recipient:</span>{" "}
                  {method === "email" ? recipientEmail : method === "fax" ? recipientFax : recipientName || "Manual"}
                </p>
                <p>
                  <span className="font-semibold">Materials:</span>{" "}
                  {selectedMaterials.length ? selectedMaterials.map((m) => m.name).join(", ") : "None selected"}
                </p>
                {method === "email" ? (
                  <>
                    <p>
                      <span className="font-semibold">Subject:</span> {subject}
                    </p>
                    <pre className="whitespace-pre-wrap rounded-lg bg-white p-2 text-xs">{message}</pre>
                  </>
                ) : null}
                {method === "fax" ? <pre className="whitespace-pre-wrap rounded-lg bg-white p-2 text-xs">{coverSheet}</pre> : null}
                <p className="text-xs text-slate-600">
                  {createFollowUp ? "A follow-up task will be created to confirm receipt." : "No follow-up task will be created."}
                </p>
              </div>
            )}

            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (step === "preview") setStep("edit");
                  else setOpen(false);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700"
              >
                {step === "preview" ? "Back" : "Cancel"}
              </button>
              {step === "edit" ? (
                <button
                  type="button"
                  disabled={method !== "manual" && (missingRecipient || methodUnavailable)}
                  onClick={() => setStep("preview")}
                  className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Preview
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submitSend()}
                  className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? "Sending…" : method === "manual" ? "Confirm manual send" : "Send Packet"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function FacilityPacketDeliveryHistoryModal({
  packetRequestId,
  className,
}: {
  packetRequestId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<PacketDeliveryAttemptRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/facilities/packet-requests/${packetRequestId}/delivery-attempts`);
      const data = (await res.json()) as { ok: boolean; attempts?: PacketDeliveryAttemptRow[] };
      if (data.ok) setAttempts(data.attempts ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        Delivery history
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Delivery history</h3>
            {loading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
            {!loading && attempts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No delivery attempts yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {attempts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="font-semibold capitalize">
                      {a.delivery_method} · {a.status}
                    </p>
                    <p className="text-xs text-slate-500">
                      {a.sent_at ? new Date(a.sent_at).toLocaleString() : new Date(a.created_at).toLocaleString()}
                    </p>
                    {a.error_message ? <p className="mt-1 text-xs text-rose-700">{a.error_message}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
