"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PacketDetailActions({
  packetId,
  status,
  completedDocId,
  hasCompletedPdfFile,
}: {
  packetId: string;
  status: string;
  completedDocId: string | null;
  hasCompletedPdfFile: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const downloadHref =
    completedDocId && hasCompletedPdfFile
      ? `/api/pdf-sign/admin/download?packetDocumentId=${encodeURIComponent(completedDocId)}`
      : null;

  async function resend(channel: "email" | "sms") {
    setBusy(true);
    try {
      const res = await fetch(`/api/pdf-sign/admin/packets/${encodeURIComponent(packetId)}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, rotateToken: true }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailSent?: boolean;
        emailError?: string | null;
        smsSent?: boolean;
        smsError?: string | null;
      };
      if (!res.ok) {
        alert(j.error || `Could not ${channel === "email" ? "resend email" : "send SMS"}.`);
        return;
      }
      if (channel === "email" && j.emailSent === false && j.emailError) {
        alert(
          `Email failed to send:\n${j.emailError}\n\nUse Copy signing link below to share the link manually.`
        );
      }
      if (channel === "sms" && j.smsSent === false && j.smsError) {
        alert(`SMS failed:\n${j.smsError}\n\nUse Copy signing link if you need another channel.`);
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
      const j = (await res.json().catch(() => ({}))) as { error?: string; signUrl?: string };
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
    const cancel_reason = window.prompt("Optional reason for canceling:", "") || undefined;
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
    const msg =
      status === "completed" || status === "signed"
        ? "Remove this completed packet from the admin list? The signed PDF stays in storage."
        : "Remove this packet from the admin list?";
    if (!window.confirm(msg)) return;
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
      router.push("/admin/signatures/packets");
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
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canOperateLinks ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resend("email")}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Resend email
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void resend("sms")}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Send SMS link
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void copyLink()}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Copy signing link
            </button>
          </>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancelPacket()}
            className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
          >
            Cancel signing
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void softDeletePacket()}
          className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
        >
          Remove from list
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {downloadHref ? (
          <>
            <a
              href={downloadHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600"
            >
              Download signed PDF
            </a>
            <button
              type="button"
              onClick={printCompleted}
              className="inline-flex rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Print signed PDF
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-500">
            The signed PDF will appear here when signing is complete and the file has been stored.
          </p>
        )}
      </div>
    </div>
  );
}
