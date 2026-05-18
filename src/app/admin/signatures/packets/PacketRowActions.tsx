"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PacketRowActions({
  packetId,
  status,
  documentId,
  hasCompletedPdfFile,
}: {
  packetId: string;
  status: string;
  documentId: string | null | undefined;
  hasCompletedPdfFile: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const downloadHref =
    documentId && hasCompletedPdfFile
      ? `/api/pdf-sign/admin/download?packetDocumentId=${encodeURIComponent(documentId)}`
      : null;

  async function resendSigningLink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/packets/${encodeURIComponent(packetId)}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        signUrl?: string;
        error?: string;
        emailSent?: boolean;
        emailError?: string | null;
        smsSent?: boolean;
        smsError?: string | null;
        deliveryStatusMessage?: string | null;
      };
      if (!res.ok) {
        alert(j.error || "Could not resend signing link.");
        return;
      }
      if (j.deliveryStatusMessage) {
        alert(j.deliveryStatusMessage);
      } else if (j.emailSent === false && j.emailError) {
        alert(
          `Packet updated, but email failed to send:\n${j.emailError}\n\nUse "Copy signing link" to share the link manually.`
        );
      } else if (j.smsSent === false && j.smsError) {
        alert(`Text message failed:\n${j.smsError}\n\nUse "Copy signing link" to share the link manually.`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/packets/${encodeURIComponent(packetId)}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyOnly: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        signUrl?: string;
        error?: string;
      };
      if (!res.ok || !j.signUrl) {
        alert(j.error || "Could not generate signing link.");
        return;
      }
      try {
        await navigator.clipboard.writeText(j.signUrl);
      } catch {
        prompt("Copy this signing link:", j.signUrl);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function cancelPacket() {
    const cancel_reason =
      typeof window !== "undefined" ? window.prompt("Optional reason for canceling:", "") || undefined : undefined;
    if (!window.confirm("Cancel this packet? The signing link will stop working immediately.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/packets/${encodeURIComponent(packetId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel_reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || "Could not cancel packet.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function softDeletePacket() {
    const label =
      status === "completed" || status === "signed"
        ? "Remove this completed packet from the admin list? The signed PDF stays in storage."
        : "Remove this packet from the admin list?";
    if (!window.confirm(label)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/packets/${encodeURIComponent(packetId)}`, {
        method: "DELETE",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(j.error || "Could not remove packet.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function printCompleted() {
    if (!downloadHref) return;
    window.open(downloadHref, "_blank", "noopener,noreferrer");
  }

  const isCompleted = status === "completed" || status === "signed";
  const isEnded = ["voided", "expired", "canceled"].includes(status);
  const canOperateLinks = !isCompleted && !isEnded;

  const canCancel = ["sent", "viewed", "in_progress"].includes(status);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Link
        href={`/admin/signatures/packets/${encodeURIComponent(packetId)}`}
        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50"
      >
        Details
      </Link>
      {isCompleted && downloadHref ? (
        <>
          <a
            href={downloadHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
          >
            Download
          </a>
          <button
            type="button"
            onClick={printCompleted}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            Print
          </button>
        </>
      ) : (
        <span
          className="inline-flex cursor-not-allowed rounded-full border border-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-400"
          title="Available when signing is complete"
        >
          Download
        </span>
      )}
      {canOperateLinks ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void copyLink()}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Copy link
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resendSigningLink()}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Resend signing link
          </button>
        </>
      ) : null}
      {canCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void cancelPacket()}
          className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
        >
          Cancel signing
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void softDeletePacket()}
        className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
      >
        {isCompleted ? "Remove from list" : "Remove"}
      </button>
    </div>
  );
}
