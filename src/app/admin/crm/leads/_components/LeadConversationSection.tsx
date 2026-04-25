"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ensureLeadSmsThreadAction,
  loadLeadSmsThreadBootstrapAction,
  type LoadLeadSmsThreadBootstrapResult,
} from "@/app/admin/crm/leads/lead-sms-thread-actions";
import { buildWorkspaceInboxLeadSmsHref } from "@/lib/workspace-phone/launch-urls";
import type { WorkspaceSmsThreadBootstrap } from "@/lib/phone/workspace-sms-thread-bootstrap";

const WorkspaceSmsThreadView = dynamic(
  () =>
    import("@/app/workspace/phone/inbox/_components/WorkspaceSmsThreadView").then((m) => m.WorkspaceSmsThreadView),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[14rem] flex-1 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/80"
        aria-hidden
      >
        <p className="text-sm text-slate-500">Loading messages…</p>
      </div>
    ),
  }
);

const SmsThreadMarkReadOnViewClient = dynamic(
  () =>
    import("@/app/admin/phone/messages/_components/SmsThreadMarkReadOnViewClient").then(
      (m) => m.SmsThreadMarkReadOnViewClient
    ),
  { ssr: false }
);

type Props = {
  leadId: string;
  contactId: string;
  /** From server: phone-first thread resolution; may be null when no thread yet. */
  initialConversationId: string | null;
};

export function LeadConversationSection({ leadId, contactId, initialConversationId }: Props) {
  const gateRef = useRef<HTMLDivElement | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const [sectionVisible, setSectionVisible] = useState(false);
  const [resolvedConversationId, setResolvedConversationId] = useState<string | null>(initialConversationId);
  const [bootstrap, setBootstrap] = useState<WorkspaceSmsThreadBootstrap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [ensurePending, setEnsurePending] = useState(false);
  const [ensureError, setEnsureError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    setResolvedConversationId(initialConversationId);
  }, [initialConversationId]);

  useEffect(() => {
    const el = gateRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setSectionVisible(true);
      },
      { rootMargin: "140px 0px", threshold: 0.02 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    loadedForRef.current = null;
    setBootstrap(null);
    setLoadError(null);
  }, [resolvedConversationId]);

  useEffect(() => {
    if (!sectionVisible || !resolvedConversationId) return;
    if (loadedForRef.current === resolvedConversationId) return;

    let cancelled = false;
    setLoadingBootstrap(true);
    void loadLeadSmsThreadBootstrapAction(resolvedConversationId).then((res: LoadLeadSmsThreadBootstrapResult) => {
      if (cancelled) return;
      setLoadingBootstrap(false);
      if (res.ok) {
        loadedForRef.current = resolvedConversationId;
        setBootstrap(res.data);
        setLoadError(null);
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sectionVisible, resolvedConversationId, retryNonce]);

  const openInboxHref =
    resolvedConversationId != null
      ? buildWorkspaceInboxLeadSmsHref({ conversationId: resolvedConversationId, leadId })
      : null;

  const startThread = async () => {
    setEnsureError(null);
    setEnsurePending(true);
    try {
      const r = await ensureLeadSmsThreadAction(contactId);
      if (r.ok) {
        setResolvedConversationId(r.conversationId);
      } else {
        setEnsureError(r.error);
      }
    } finally {
      setEnsurePending(false);
    }
  };

  return (
    <div ref={gateRef} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Same thread and send path as workspace phone inbox. Messages sync in real time.
        </p>
        {openInboxHref ? (
          <Link
            href={openInboxHref}
            className="shrink-0 text-xs font-semibold text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline"
          >
            Open in Inbox
          </Link>
        ) : null}
      </div>

      {!resolvedConversationId ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">No SMS thread yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Start a conversation to text this lead from the CRM. Nothing is sent until you write a message.
          </p>
          {ensureError ? (
            <p className="mt-3 text-xs font-medium text-rose-700" role="alert">
              {ensureError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void startThread()}
            disabled={ensurePending}
            className="mt-4 rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
          >
            {ensurePending ? "Starting…" : "Start conversation"}
          </button>
        </div>
      ) : !sectionVisible ? (
        <div className="flex min-h-[6rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4">
          <p className="text-center text-xs text-slate-500">
            Scroll this section into view to load the SMS thread and avoid extra work until you need it.
          </p>
        </div>
      ) : loadingBootstrap && !bootstrap ? (
        <div className="flex min-h-[14rem] items-center justify-center rounded-xl border border-slate-200/80 bg-white">
          <p className="text-sm text-slate-500">Loading messages…</p>
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-rose-800 underline hover:text-rose-950"
            onClick={() => {
              loadedForRef.current = null;
              setLoadError(null);
              setRetryNonce((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : bootstrap ? (
        <>
          <SmsThreadMarkReadOnViewClient conversationId={bootstrap.conversationId} />
          <div className="flex h-[min(28rem,52vh)] min-h-[16rem] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-200/40">
            <WorkspaceSmsThreadView
              key={bootstrap.conversationId}
              conversationId={bootstrap.conversationId}
              initialMessages={bootstrap.initialMessages}
              voicemailDetailByCallId={bootstrap.voicemailDetailByCallId}
              initialSuggestion={bootstrap.initialSuggestion}
              suggestionForMessageId={bootstrap.suggestionForMessageId}
              composerInitialDraft={bootstrap.composerInitialDraft}
              smsPreferredFromE164={bootstrap.smsPreferredFromE164 ?? undefined}
              smsInboundToE164={bootstrap.smsInboundToE164 ?? undefined}
              appDesktopSplit={false}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
