"use client";

import { useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { saveSmsMmsAttachmentToLeadInsurance } from "@/app/workspace/phone/inbox/actions";
import type { WorkspaceSmsThreadAttachment } from "@/lib/phone/workspace-sms-thread-messages";

const LEAD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mediaHref(id: string): string {
  return `/api/workspace/phone/message-media/${encodeURIComponent(id)}`;
}

function isInlineImageCt(ct: string | null): boolean {
  if (!ct) return false;
  const s = ct.toLowerCase().split(";")[0]!.trim();
  return (
    s === "image/jpeg" ||
    s === "image/png" ||
    s === "image/webp" ||
    s === "image/gif"
  );
}

export function sortThreadAttachments(rows: WorkspaceSmsThreadAttachment[]): WorkspaceSmsThreadAttachment[] {
  return [...rows].sort((a, b) => {
    const ai = typeof a.provider_media_index === "number" ? a.provider_media_index : 0;
    const bi = typeof b.provider_media_index === "number" ? b.provider_media_index : 0;
    return ai !== bi ? ai - bi : a.id.localeCompare(b.id);
  });
}

export function SmsMessageMediaAttachments(props: {
  inbound: boolean;
  attachments: WorkspaceSmsThreadAttachment[];
  /** Active CRM lead for this texting thread — enables Primary / Secondary insurance save. */
  smsLeadInsuranceTargetId: string | null;
}) {
  const { inbound, attachments, smsLeadInsuranceTargetId } = props;
  const sorted = useMemo(() => sortThreadAttachments(attachments), [attachments]);
  const [busyAttachmentId, setBusyAttachmentId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const lid = (smsLeadInsuranceTargetId ?? "").trim();
  const canSaveLead =
    Boolean(inbound && lid && LEAD_UUID_RE.test(lid));

  async function runSave(attId: string, slot: "primary" | "secondary") {
    if (!canSaveLead) return;
    setBusyAttachmentId(attId);
    setFlash(null);
    const fd = new FormData();
    fd.set("attachmentId", attId);
    fd.set("leadId", lid);
    fd.set("slot", slot);
    const res = await saveSmsMmsAttachmentToLeadInsurance(fd);
    setBusyAttachmentId(null);
    setFlash(res.ok ? `Saved to CRM (${slot} insurance)` : res.error ?? "Could not save");
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        {sorted.map((att) => {
          const ct = typeof att.content_type === "string" ? att.content_type : "";
          const name = typeof att.file_name === "string" && att.file_name.trim() ? att.file_name.trim() : "Attachment";
          const href = mediaHref(att.id);
          const isImg = isInlineImageCt(ct || null);

          return (
            <div
              key={att.id}
              className={`relative flex max-w-[11rem] flex-col gap-1 rounded-xl border p-2 ${
                inbound ? "border-slate-200/90 bg-white" : "border-white/25 bg-black/15"
              }`}
            >
              {isImg ? (
                <a href={href} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL gate needs native img */}
                  <img
                    src={href}
                    alt={name}
                    loading="lazy"
                    className="h-28 w-full object-cover motion-safe:transition motion-safe:hover:brightness-[1.03]"
                  />
                </a>
              ) : (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold ${
                    inbound
                      ? "bg-slate-100 text-slate-900 hover:bg-slate-200/90"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-85" aria-hidden />
                  <span className="line-clamp-2 min-w-0 leading-snug">{name}</span>
                </a>
              )}
              {canSaveLead ? (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">CRM</span>
                  <button
                    type="button"
                    disabled={busyAttachmentId !== null}
                    className="rounded-md border border-sky-400/70 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-sky-950 hover:bg-sky-50 disabled:opacity-50"
                    onClick={() => void runSave(att.id, "primary")}
                  >
                    Primary card
                  </button>
                  <button
                    type="button"
                    disabled={busyAttachmentId !== null}
                    className="rounded-md border border-violet-300/70 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-violet-950 hover:bg-violet-50 disabled:opacity-50"
                    onClick={() => void runSave(att.id, "secondary")}
                  >
                    Secondary
                  </button>
                  {busyAttachmentId === att.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Saving" />
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {flash ? <p className="text-[11px] text-slate-600">{flash}</p> : null}
    </div>
  );
}
