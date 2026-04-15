"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw, Save, Sparkles, X } from "lucide-react";

import { CallSavedOutputsViewer } from "@/components/phone/CallSavedOutputsViewer";

type OutputKind = "soap" | "summary" | "intake";

const OUTPUT_TITLES: Record<OutputKind, string> = {
  soap: "SOAP note",
  summary: "Call summary",
  intake: "Intake summary",
};

type OutputPanelState = {
  kind: OutputKind;
  loading: boolean;
  text: string;
  error: string | null;
  phoneCallId: string | null;
};

export function CallDetailCallOutputsSection({
  phoneCallId,
  externalCallSid,
}: {
  phoneCallId: string;
  externalCallSid: string;
}) {
  const callSid = typeof externalCallSid === "string" ? externalCallSid.trim() : "";
  const canGenerate = callSid.startsWith("CA");

  const [outputPanel, setOutputPanel] = useState<OutputPanelState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<null | { type: "ok" | "err"; message: string }>(null);
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  const phoneCallIdForSave = (outputPanel?.phoneCallId ?? phoneCallId) as string | null;

  const runGenerate = useCallback(
    async (kind: OutputKind) => {
      if (!canGenerate) return;
      setSaveFeedback(null);
      setOutputPanel({ kind, loading: true, text: "", error: null, phoneCallId: null });
      try {
        const res = await fetch("/api/workspace/phone/generate-call-output", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callSid, type: kind }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          content?: string;
          error?: string;
          phone_call_id?: string;
        };
        if (!res.ok) {
          setOutputPanel({
            kind,
            loading: false,
            text: "",
            error: j.error ?? `Could not generate (${res.status})`,
            phoneCallId: null,
          });
          return;
        }
        const pid = typeof j.phone_call_id === "string" ? j.phone_call_id : null;
        setOutputPanel({
          kind,
          loading: false,
          text: (j.content ?? "").trim(),
          error: null,
          phoneCallId: pid,
        });
      } catch (e) {
        setOutputPanel({
          kind,
          loading: false,
          text: "",
          error: e instanceof Error ? e.message : "Network error",
          phoneCallId: null,
        });
      }
    },
    [callSid, canGenerate]
  );

  const saveOutput = useCallback(async () => {
    if (!outputPanel || outputPanel.loading || saving) return;
    const pid = phoneCallIdForSave;
    if (!pid || !outputPanel.text.trim()) {
      setSaveFeedback({ type: "err", message: "Cannot save — call record or content missing." });
      return;
    }
    setSaving(true);
    setSaveFeedback(null);
    try {
      const res = await fetch("/api/workspace/phone/call-outputs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_call_id: pid,
          type: outputPanel.kind,
          content: outputPanel.text,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setSaveFeedback({ type: "err", message: j.error ?? `Save failed (${res.status})` });
        return;
      }
      setSaveFeedback({ type: "ok", message: "Saved to this call." });
      setSavedRefreshKey((k) => k + 1);
    } catch (e) {
      setSaveFeedback({
        type: "err",
        message: e instanceof Error ? e.message : "Network error while saving",
      });
    } finally {
      setSaving(false);
    }
  }, [outputPanel, phoneCallIdForSave, saving]);

  const copyOutput = useCallback(async () => {
    if (!outputPanel?.text) return;
    try {
      await navigator.clipboard.writeText(outputPanel.text);
    } catch {
      /* ignore */
    }
  }, [outputPanel]);

  useEffect(() => {
    if (!outputPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSaveFeedback(null);
        setOutputPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outputPanel]);

  useEffect(() => {
    if (!saveFeedback || saveFeedback.type !== "ok") return;
    const t = window.setTimeout(() => setSaveFeedback(null), 5000);
    return () => window.clearTimeout(t);
  }, [saveFeedback]);

  return (
    <>
      <div className="mt-6 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Post-call generation</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Manual only — same AI as the workspace transcript. Uses stored transcript from this call when available.
        </p>
        {!canGenerate ? (
          <p className="mt-3 text-sm text-amber-800">
            No Twilio CallSid (<code className="rounded bg-amber-100 px-1 text-xs">CA…</code>) on this row — generation is
            unavailable.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runGenerate("soap")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              Generate SOAP note
            </button>
            <button
              type="button"
              onClick={() => void runGenerate("summary")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              Generate call summary
            </button>
            <button
              type="button"
              onClick={() => void runGenerate("intake")}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden />
              Generate intake summary
            </button>
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-slate-200/80 pt-6">
        <CallSavedOutputsViewer key={savedRefreshKey} phoneCallId={phoneCallId} embedded heading="" />
      </div>

      {outputPanel ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Close generated output panel"
            onClick={() => {
              setSaveFeedback(null);
              setOutputPanel(null);
            }}
          />
          <aside
            className="fixed bottom-0 right-0 top-0 z-[61] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
            role="complementary"
            aria-label="Generated note"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{OUTPUT_TITLES[outputPanel.kind]}</p>
                <p className="text-[11px] text-slate-500">Review and edit before saving</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setSaveFeedback(null);
                  setOutputPanel(null);
                }}
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {outputPanel.loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
                  <p className="mt-4 text-sm font-medium text-slate-800">Generating…</p>
                  <p className="mt-1 text-xs text-slate-500">This may take a few seconds.</p>
                </div>
              ) : outputPanel.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
                  {outputPanel.error}
                </div>
              ) : (
                <textarea
                  className="min-h-[min(60vh,28rem)] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  value={outputPanel.text}
                  onChange={(e) =>
                    setOutputPanel((p) => (p ? { ...p, text: e.target.value } : p))
                  }
                  spellCheck
                />
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 px-4 py-3">
              {saveFeedback ? (
                <div
                  role="status"
                  className={
                    saveFeedback.type === "ok"
                      ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900"
                      : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-900"
                  }
                >
                  {saveFeedback.message}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={outputPanel.loading || !outputPanel.text.trim()}
                  onClick={() => void copyOutput()}
                  className="inline-flex flex-1 min-w-[6rem] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copy
                </button>
                <button
                  type="button"
                  disabled={
                    outputPanel.loading ||
                    saving ||
                    !outputPanel.text.trim() ||
                    !phoneCallIdForSave
                  }
                  onClick={() => void saveOutput()}
                  className="inline-flex flex-1 min-w-[6rem] items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Save
                </button>
                <button
                  type="button"
                  disabled={outputPanel.loading || !canGenerate}
                  onClick={() => void runGenerate(outputPanel.kind)}
                  className="inline-flex w-full min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Regenerate
                </button>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
