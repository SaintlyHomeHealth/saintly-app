"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  INTERNAL_CHAT_REF_KINDS,
  refComposerToken,
  refKindDisplayLabel,
  type InternalChatRefKind,
} from "@/lib/internal-chat/internal-chat-ref-kinds";
import { Bell, BellOff, Camera, ChevronLeft, FileText, ImageIcon, Link2, Paperclip, Pin, Send, X } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";

type RefCard = {
  kind: InternalChatRefKind;
  id: string;
  label: string;
  href: string | null;
};

type PatientMentionCard = { id: string; label: string; href: string };

type ChatAttachmentItem = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
};

type Msg = {
  id: string;
  senderId: string;
  senderLabel: string;
  createdAt: string;
  body: string;
  attachmentPath: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  attachments?: ChatAttachmentItem[];
  mentionUserIds: string[];
  readByUserIds: string[];
  patientMentions?: PatientMentionCard[];
  referenceCards?: RefCard[];
};

type StaffPick = { userId: string; label: string };
type ReferenceMention = { type: InternalChatRefKind; id: string; label: string };

type ChatMemberRow = {
  userId: string;
  memberRole: string;
  label: string;
  email: string | null;
  isActive: boolean;
};

type Props = {
  chatId: string;
  title: string;
  showMemberAdmin: boolean;
  selfUserId: string;
  selfDisplayName: string;
};

const CHAT_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf,.heic,.heif";

/** UUID v4 pattern for attachment ids from API */
const CHAT_ATTACHMENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PendingAttachment = { file: File; url: string };

function uploadChatFilesWithProgress(
  form: FormData,
  onProgress: (ratio: number) => void
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/workspace/chat/attachments/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.min(1, e.loaded / e.total));
      }
    };
    xhr.onload = () => {
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        json = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, json: null });
    xhr.send(form);
  });
}

function isInlineChatImageContentType(ct: string): boolean {
  const t = ct.toLowerCase();
  return t === "image/jpeg" || t === "image/png" || t === "image/webp";
}

function isPdfContentType(ct: string): boolean {
  return ct.toLowerCase() === "application/pdf";
}

function isHeicFamilyContentType(ct: string): boolean {
  const t = ct.trim().toLowerCase();
  return t === "image/heic" || t === "image/heif" || t === "image/heic-sequence";
}

function isLikelyHeicFilename(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

function chatAttachmentProtectedPath(attachmentId: string): string {
  return `/api/workspace/chat/attachments/${encodeURIComponent(attachmentId)}`;
}

/** Stable soft bubble colors for other users (readability on light backgrounds). */
function bubbleStyleForSenderId(senderId: string): { background: string; border: string } {
  let h = 0;
  for (let i = 0; i < senderId.length; i++) {
    h = (h * 31 + senderId.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return {
    background: `hsl(${hue} 42% 93%)`,
    border: `hsl(${hue} 28% 78%)`,
  };
}

type ChatAttachmentTileProps = {
  att: ChatAttachmentItem;
  mine: boolean;
};

const ChatAttachmentTile = memo(function ChatAttachmentTile({ att, mine }: ChatAttachmentTileProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const idNorm = typeof att.id === "string" ? att.id.trim().toLowerCase() : "";
  const idOk = Boolean(idNorm && CHAT_ATTACHMENT_UUID_RE.test(idNorm));
  const srcPath = idOk ? chatAttachmentProtectedPath(idNorm) : "";

  const canTryInline =
    idOk &&
    !thumbFailed &&
    isInlineChatImageContentType(att.contentType) &&
    !isHeicFamilyContentType(att.contentType) &&
    !isLikelyHeicFilename(att.fileName);

  const openInNewTab = () => {
    if (!idOk) return;
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = origin ? `${origin}${srcPath}` : srcPath;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      /* opening must never break the chat */
    }
  };

  const cardClass = `flex w-full max-w-xs items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs font-medium ${
    mine
      ? "border-sky-400/40 bg-phone-navy/95 text-white"
      : "border-slate-200 bg-white text-slate-800 shadow-sm"
  }`;

  if (!idOk) {
    return (
      <div
        className={`max-w-xs rounded-lg border px-2 py-2 text-left text-xs ${
          mine
            ? "border-amber-400/50 bg-phone-navy/90 text-amber-100"
            : "border-amber-200 bg-amber-50/90 text-amber-900"
        }`}
      >
        Invalid attachment link
      </div>
    );
  }

  if (canTryInline) {
    return (
      <button
        type="button"
        onClick={openInNewTab}
        className={`block max-w-full overflow-hidden rounded-lg text-left ${
          mine ? "ring-1 ring-white/25" : "ring-1 ring-slate-200/90"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={srcPath}
          alt=""
          className="max-h-56 max-w-full object-contain"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setThumbFailed(true)}
        />
      </button>
    );
  }

  const previewUnavailable = thumbFailed;

  return (
    <button type="button" onClick={openInNewTab} className={cardClass}>
      {isPdfContentType(att.contentType) ? (
        <FileText className="h-8 w-8 shrink-0 opacity-90" />
      ) : (
        <ImageIcon className="h-8 w-8 shrink-0 opacity-90" />
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate">{att.fileName}</span>
        {previewUnavailable ? (
          <span
            className={`mt-0.5 block text-[10px] font-normal leading-snug ${
              mine ? "text-sky-200/90" : "text-slate-500"
            }`}
          >
            Preview unavailable — tap to open or download.
          </span>
        ) : null}
      </span>
    </button>
  );
});

export function ChatThreadClient({
  chatId,
  title,
  showMemberAdmin,
  selfUserId,
  selfDisplayName,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [staffPicks, setStaffPicks] = useState<StaffPick[]>([]);
  const [sending, setSending] = useState(false);
  const [mentionPick, setMentionPick] = useState<Array<{ userId: string; label: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [memberRole, setMemberRole] = useState("staff");
  const [canPost, setCanPost] = useState(true);
  const [members, setMembers] = useState<ChatMemberRow[]>([]);
  /** True after members loaded at least once for this chat (used for header count; avoids pre-fetching on every open thread for admins). */
  const [membersListHydrated, setMembersListHydrated] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSuggest, setMemberSuggest] = useState<Array<{ userId: string; label: string }>>([]);
  const [refMenuOpen, setRefMenuOpen] = useState(false);
  const [refTab, setRefTab] = useState<InternalChatRefKind>("patient");
  const [refQuery, setRefQuery] = useState("");
  const [refItems, setRefItems] = useState<Array<{ id: string; label: string }>>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [referenceMentions, setReferenceMentions] = useState<ReferenceMention[]>([]);
  const [membersPanelOpen, setMembersPanelOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  /** One browser client + debounced realtime reload coalesces message + attachment INSERT bursts. */
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextRealtimeReloadRef = useRef(false);

  useEffect(() => {
    setPendingFiles((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url));
      return [];
    });
  }, [chatId]);

  useEffect(() => {
    setMembersListHydrated(false);
    setMembers([]);
    setMembersPanelOpen(false);
    setMemberSearch("");
    setMemberSuggest([]);
    skipNextRealtimeReloadRef.current = false;
    if (realtimeReloadTimerRef.current) {
      clearTimeout(realtimeReloadTimerRef.current);
      realtimeReloadTimerRef.current = null;
    }
  }, [chatId]);

  const loadMembers = useCallback(async () => {
    if (!showMemberAdmin) return;
    try {
      const res = await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, { cache: "no-store" });
      const json = (await res.json()) as { members?: ChatMemberRow[] };
      setMembers(json.members ?? []);
      setMembersListHydrated(true);
    } catch {
      setMembers([]);
    }
  }, [chatId, showMemberAdmin]);

  const loadMessages = useCallback(
    async (options?: { showLoading?: boolean }): Promise<Msg[] | null> => {
      const showLoading = options?.showLoading === true;
      if (showLoading) setLoading(true);
      let result: Msg[] | null = null;
      try {
        const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          messages?: Msg[];
          notificationsMuted?: boolean;
          pinned?: boolean;
          canPost?: boolean;
        };
        const list = json.messages ?? [];
        setMessages(list);
        result = list;
        if (typeof json.notificationsMuted === "boolean") {
          setMuted(json.notificationsMuted);
        }
        if (typeof json.pinned === "boolean") {
          setPinned(json.pinned);
        }
        if (typeof json.canPost === "boolean") {
          setCanPost(json.canPost);
        }
        const last = list[list.length - 1];
        if (last?.id) {
          await fetch(`/api/workspace/internal-chat/chats/${chatId}/read`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ upToMessageId: last.id }),
          });
        }
      } catch {
        setMessages([]);
      } finally {
        if (showLoading) setLoading(false);
      }
      return result;
    },
    [chatId]
  );

  const runAfterMessageInsert = useCallback((list: Msg[] | null) => {
    if (!list?.length) return;
    const needsHydration = list.some((m) => {
      const hasLegacy = Boolean(m.attachmentPath);
      const hasNew = (m.attachments?.length ?? 0) > 0;
      const hasBody = Boolean(m.body?.trim());
      const hasRefs =
        (m.referenceCards?.length ?? 0) > 0 || (m.patientMentions?.length ?? 0) > 0;
      return !hasBody && !hasLegacy && !hasNew && !hasRefs;
    });
    if (needsHydration) {
      window.setTimeout(() => void loadMessages(), 500);
      window.setTimeout(() => void loadMessages(), 2500);
    }
  }, [loadMessages]);

  const scheduleRealtimeReload = useCallback(() => {
    if (skipNextRealtimeReloadRef.current) return;
    if (realtimeReloadTimerRef.current) clearTimeout(realtimeReloadTimerRef.current);
    realtimeReloadTimerRef.current = setTimeout(() => {
      realtimeReloadTimerRef.current = null;
      void loadMessages().then((list) => runAfterMessageInsert(list));
    }, 240);
  }, [loadMessages, runAfterMessageInsert]);

  useEffect(() => {
    void loadMessages({ showLoading: true });
  }, [loadMessages]);

  useEffect(() => {
    if (!showMemberAdmin || !membersPanelOpen) return;
    void loadMembers();
  }, [showMemberAdmin, membersPanelOpen, loadMembers]);

  useEffect(() => {
    setReferenceMentions((prev) =>
      prev.filter((r) => text.includes(refComposerToken(r.type, r.label)))
    );
  }, [text]);

  useEffect(() => {
    if (!refMenuOpen) {
      return;
    }
    const id = window.setTimeout(() => {
      void (async () => {
        setRefLoading(true);
        try {
          const res = await fetch(
            `/api/workspace/internal-chat/references?type=${encodeURIComponent(refTab)}&q=${encodeURIComponent(refQuery.trim())}`,
            { cache: "no-store" }
          );
          const json = (await res.json()) as { items?: Array<{ id: string; label: string }> };
          setRefItems(json.items ?? []);
        } catch {
          setRefItems([]);
        } finally {
          setRefLoading(false);
        }
      })();
    }, 200);
    return () => window.clearTimeout(id);
  }, [refMenuOpen, refTab, refQuery]);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createBrowserSupabaseClient();
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`internal_chat_${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        () => {
          scheduleRealtimeReload();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_message_attachments",
          filter: `chat_thread_id=eq.${chatId}`,
        },
        () => {
          scheduleRealtimeReload();
        }
      )
      .subscribe();
    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [chatId, scheduleRealtimeReload]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  const otherBubbleStyleBySenderId = useMemo(() => {
    const m = new Map<string, { background: string; border: string }>();
    for (const msg of messages) {
      if (msg.senderId === selfUserId) continue;
      if (m.has(msg.senderId)) continue;
      m.set(msg.senderId, bubbleStyleForSenderId(msg.senderId));
    }
    return m;
  }, [messages, selfUserId]);

  function upsertStaffPick(userId: string, label: string) {
    setStaffPicks((prev) => {
      const rest = prev.filter((p) => p.userId !== userId);
      return [...rest, { userId, label }];
    });
  }

  function pickReference(kind: InternalChatRefKind, id: string, label: string) {
    const token = refComposerToken(kind, label);
    setText((prev) => {
      const base = prev.trim();
      return base ? `${prev}${prev.endsWith(" ") ? "" : " "}${token} ` : `${token} `;
    });
    setReferenceMentions((prev) => {
      const k = `${kind}:${id}`;
      const rest = prev.filter((r) => `${r.type}:${r.id}` !== k);
      return [...rest, { type: kind, id, label }];
    });
    setRefMenuOpen(false);
    setRefQuery("");
  }

  async function send() {
    const t = text.trim();
    const sp = staffPicks.filter((p) => text.includes(`@${p.label}`));
    const rr = referenceMentions.filter((r) => text.includes(refComposerToken(r.type, r.label)));
    const hasPending = pendingFiles.length > 0;
    if ((!t && rr.length === 0 && sp.length === 0 && !hasPending) || sending) return;
    setSending(true);
    if (hasPending) {
      setUploadProgress(0);
    }
    try {
      if (hasPending) {
        const form = new FormData();
        form.set("chat_thread_id", chatId);
        form.set(
          "meta",
          JSON.stringify({
            text: t,
            staffMentions: sp.map((p) => ({ userId: p.userId, label: p.label })),
            referenceMentions: rr.map((p) => ({ type: p.type, id: p.id, label: p.label })),
            patientMentions: [],
          })
        );
        for (const row of pendingFiles) {
          form.append("files", row.file);
        }
        const up = await uploadChatFilesWithProgress(form, (ratio) => setUploadProgress(ratio));
        if (!up.ok) {
          console.warn("[chat] multipart upload failed", up.status);
          return;
        }
        skipNextRealtimeReloadRef.current = true;
        if (realtimeReloadTimerRef.current) {
          clearTimeout(realtimeReloadTimerRef.current);
          realtimeReloadTimerRef.current = null;
        }
        for (const row of pendingFiles) {
          URL.revokeObjectURL(row.url);
        }
        setPendingFiles([]);
        setText("");
        setStaffPicks([]);
        setReferenceMentions([]);
        const list = await loadMessages();
        runAfterMessageInsert(list);
        window.setTimeout(() => {
          skipNextRealtimeReloadRef.current = false;
        }, 600);
        return;
      }

      const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t,
          staffMentions: sp.map((p) => ({ userId: p.userId, label: p.label })),
          referenceMentions: rr.map((p) => ({ type: p.type, id: p.id, label: p.label })),
          patientMentions: [],
        }),
      });
      if (res.ok) {
        setText("");
        setStaffPicks([]);
        setReferenceMentions([]);
        const list = await loadMessages();
        runAfterMessageInsert(list);
      }
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  }

  async function openAttachment(path: string) {
    try {
      const res = await fetch(`/api/workspace/internal-chat/attachment-url?path=${encodeURIComponent(path)}`);
      const json = (await res.json()) as { url?: string };
      if (json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      /* ignore */
    }
  }

  function addPendingFromFileList(list: FileList | null) {
    if (!list?.length) return;
    const next: PendingAttachment[] = [];
    for (const file of [...list]) {
      if (!file.size) continue;
      next.push({ file, url: URL.createObjectURL(file) });
    }
    if (!next.length) return;
    setPendingFiles((p) => [...p, ...next].slice(0, 12));
  }

  function removePendingAt(index: number) {
    setPendingFiles((p) => {
      const row = p[index];
      if (row) URL.revokeObjectURL(row.url);
      return p.filter((_, i) => i !== index);
    });
  }

  useEffect(() => {
    const m = text.match(/@([\w.'\u2019+-]*)$/u);
    const q = (m?.[1] ?? "").trim();
    if (!m || q.length < 1) {
      setShowMentions(false);
      setMentionPick([]);
      return;
    }
    setShowMentions(true);
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/workspace/internal-chat/directory?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { users?: Array<{ userId: string; label: string }> };
        setMentionPick((json.users ?? []).slice(0, 8));
      } catch {
        setMentionPick([]);
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [text]);

  useEffect(() => {
    if (!showMemberAdmin || memberSearch.trim().length < 2) {
      setMemberSuggest([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspace/internal-chat/directory?q=${encodeURIComponent(memberSearch.trim())}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as { users?: Array<{ userId: string; label: string }> };
        const existing = new Set(members.map((x) => x.userId));
        setMemberSuggest((json.users ?? []).filter((u) => !existing.has(u.userId)).slice(0, 12));
      } catch {
        setMemberSuggest([]);
      }
    }, 200);
    return () => window.clearTimeout(id);
  }, [memberSearch, members, showMemberAdmin]);

  async function toggleMute() {
    const next = !muted;
    const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/mute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: next }),
    });
    if (res.ok) {
      setMuted(next);
    }
  }

  async function togglePin() {
    const next = !pinned;
    const res = await fetch(`/api/workspace/internal-chat/chats/${chatId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });
    if (res.ok) {
      setPinned(next);
    }
  }

  async function addMemberByUserId(userId: string) {
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberRole }),
    });
    setMemberSearch("");
    setMemberSuggest([]);
    await loadMembers();
  }

  async function removeMember(userId: string) {
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    await loadMembers();
  }

  async function updateMemberRole(userId: string, role: string) {
    await fetch(`/api/admin/internal-chat/chats/${chatId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, memberRole: role }),
    });
    await loadMembers();
  }

  function insertStaffMentionFromPicker(userId: string, label: string) {
    const m = text.match(/^(.*)@([\w.'\u2019+-]*)$/u);
    const prefix = m ? m[1] ?? "" : text;
    setText(`${prefix}@${label} `);
    upsertStaffPick(userId, label);
    setShowMentions(false);
    setMentionPick([]);
  }

  const canSend =
    pendingFiles.length > 0 ||
    Boolean(text.trim()) ||
    staffPicks.some((p) => text.includes(`@${p.label}`)) ||
    referenceMentions.some((r) => text.includes(refComposerToken(r.type, r.label)));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2">
        <Link
          href="/workspace/phone/chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 sm:h-9 sm:w-9 sm:rounded-xl"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1 pl-1.5 sm:pl-2">
          <h1 className="truncate text-[13px] font-bold leading-tight text-slate-900 sm:text-sm">{title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void togglePin()}
          className={`shrink-0 rounded-lg p-1.5 sm:p-2 ${pinned ? "bg-amber-50 text-amber-800" : "text-slate-500"}`}
          title={pinned ? "Unpin chat" : "Pin chat"}
          aria-pressed={pinned}
          aria-label={pinned ? "Unpin chat" : "Pin chat"}
        >
          <Pin className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void toggleMute()}
          className={`flex shrink-0 items-center gap-1 rounded-lg p-1.5 sm:gap-0 sm:p-2 ${
            muted
              ? "bg-slate-200/80 text-slate-800"
              : "text-sky-700 hover:bg-sky-50"
          }`}
          title={muted ? "Muted" : "Notifications on"}
          aria-pressed={muted}
          aria-label={muted ? "Muted. Press to turn notifications on." : "Notifications on. Press to mute."}
        >
          {muted ? <BellOff className="h-4 w-4" strokeWidth={2} /> : <Bell className="h-4 w-4" strokeWidth={2} />}
          <span className="max-w-[4.5rem] truncate text-[10px] font-semibold sm:sr-only">
            {muted ? "Muted" : "On"}
          </span>
        </button>
      </header>

      {showMemberAdmin ? (
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/90 px-2 py-1.5 sm:px-3 sm:py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium text-slate-700">
              Members{membersListHydrated ? ` · ${members.length}` : ""}
            </p>
            <button
              type="button"
              onClick={() => setMembersPanelOpen((o) => !o)}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm"
              aria-expanded={membersPanelOpen}
            >
              {membersPanelOpen ? "Done" : "Manage"}
            </button>
          </div>
        </div>
      ) : null}

      {showMemberAdmin && membersPanelOpen ? (
        <div className="max-h-56 shrink-0 overflow-y-auto border-b border-slate-100 bg-slate-50 px-2 py-2 text-xs sm:px-3">
          <div className="font-semibold text-slate-800">Add or edit members</div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search staff to add…"
              className="min-w-[10rem] flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
            />
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1"
            >
              <option value="staff">Staff</option>
              <option value="read_only">Read-only</option>
              <option value="admin">Channel admin</option>
            </select>
          </div>
          {memberSuggest.length > 0 ? (
            <ul className="mt-1 max-h-24 overflow-y-auto rounded border border-slate-200 bg-white">
              {memberSuggest.map((u) => (
                <li key={u.userId}>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    onClick={() => void addMemberByUserId(u.userId)}
                  >
                    {u.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-2 space-y-1">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200/80 bg-white px-2 py-1"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-900">{m.label}</span>
                  {m.email ? <span className="ml-1 text-slate-500">({m.email})</span> : null}
                  {!m.isActive ? <span className="ml-1 text-amber-700">inactive</span> : null}
                </span>
                <div className="flex items-center gap-1">
                  <select
                    value={m.memberRole}
                    className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                    onChange={(e) => void updateMemberRole(m.userId, e.target.value)}
                  >
                    <option value="staff">Staff</option>
                    <option value="read_only">Read-only</option>
                    <option value="admin">Admin</option>
                  </select>
                  {m.userId !== selfUserId ? (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-rose-700"
                      onClick={() => void removeMember(m.userId)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-slate-50/40 px-2.5 py-2.5 sm:space-y-3 sm:px-3 sm:py-3">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {!loading && messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet. Say hello.</p>
        ) : null}
        {messages.map((m) => {
          const mine = m.senderId === selfUserId;
          const otherStyle = !mine
            ? otherBubbleStyleBySenderId.get(m.senderId) ?? bubbleStyleForSenderId(m.senderId)
            : null;
          const nameLine = mine ? selfDisplayName : m.senderLabel;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[90%] rounded-2xl border px-3 py-2 text-sm ${
                  mine
                    ? "border-phone-border/30 bg-phone-navy text-white"
                    : "text-slate-900 shadow-sm"
                }`}
                style={
                  !mine && otherStyle
                    ? {
                        background: otherStyle.background,
                        borderColor: otherStyle.border,
                      }
                    : undefined
                }
              >
                <div
                  className={`mb-0.5 max-w-full truncate text-[10px] font-semibold leading-tight ${
                    mine ? "text-sky-100" : "text-slate-600"
                  }`}
                >
                  {nameLine}
                </div>
                {m.body ? (
                  <div className="whitespace-pre-wrap break-words leading-snug">{m.body}</div>
                ) : null}
                {m.referenceCards && m.referenceCards.length > 0 ? (
                  <div className={`mt-2 space-y-1.5 ${mine ? "text-sky-100" : ""}`}>
                    {m.referenceCards.map((p) => {
                      const inner = (
                        <span
                          className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs font-medium ${
                            mine
                              ? "border-sky-400/50 bg-phone-navy/90 text-white"
                              : "border-sky-200/80 bg-white/80 text-sky-950 shadow-sm"
                          }`}
                        >
                          <span
                            className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${
                              mine ? "text-sky-200/85" : "text-sky-600/90"
                            }`}
                          >
                            {refKindDisplayLabel(p.kind)}
                          </span>
                          <span className="min-w-0 truncate">{p.label}</span>
                        </span>
                      );
                      return p.href ? (
                        <Link key={`${p.kind}-${p.id}`} href={p.href} className="block w-fit max-w-full">
                          {inner}
                        </Link>
                      ) : (
                        <div key={`${p.kind}-${p.id}`} className="w-fit max-w-full">
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                ) : m.patientMentions && m.patientMentions.length > 0 ? (
                  <div className={`mt-2 space-y-1 ${mine ? "text-sky-100" : ""}`}>
                    {m.patientMentions.map((p) => (
                      <Link
                        key={p.id}
                        href={p.href}
                        className={`block rounded-lg border px-2 py-1.5 text-xs font-medium ${
                          mine
                            ? "border-sky-400/50 bg-phone-navy/90 text-white"
                            : "border-sky-200/90 bg-white/60 text-sky-900"
                        }`}
                      >
                        Patient · {p.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {m.attachments && m.attachments.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {m.attachments.map((att) => (
                      <ChatAttachmentTile key={att.id} att={att} mine={mine} />
                    ))}
                  </div>
                ) : null}
                {m.attachmentPath ? (
                  <button
                    type="button"
                    onClick={() => void openAttachment(m.attachmentPath!)}
                    className={`mt-2 text-xs underline ${mine ? "text-sky-200" : "text-sky-800"}`}
                  >
                    {m.attachmentName ?? "Attachment"}
                  </button>
                ) : null}
                <div
                  className={`mt-1.5 text-[10px] tabular-nums ${
                    mine ? "text-sky-200/90" : "text-slate-500"
                  }`}
                >
                  {formatAppDateTime(m.createdAt, "—", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {mine && m.readByUserIds.filter((id) => id !== selfUserId).length > 0 ? " · Read" : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="z-10 shrink-0 border-t border-slate-200 bg-white px-2 pt-2 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        {!canPost ? (
          <p className="mb-2 text-center text-xs text-slate-500">You have read-only access in this chat.</p>
        ) : null}
        {showMentions && mentionPick.length > 0 ? (
          <div className="mb-2 max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs shadow-sm">
            {mentionPick.map((u) => (
              <button
                key={u.userId}
                type="button"
                className="block w-full px-2 py-1.5 text-left hover:bg-slate-50"
                onClick={() => insertStaffMentionFromPicker(u.userId, u.label)}
              >
                {u.label}
              </button>
            ))}
          </div>
        ) : null}
        {canPost && pendingFiles.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((pf, i) => (
              <div key={`${pf.url}-${i}`} className="relative">
                {pf.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pf.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                    <FileText className="h-8 w-8 text-slate-500" />
                  </div>
                )}
                <button
                  type="button"
                  className="absolute -right-1 -top-1 rounded-full bg-slate-800 p-0.5 text-white shadow"
                  onClick={() => removePendingAt(i)}
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {canPost && uploadProgress !== null && sending ? (
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-phone-navy transition-all"
              style={{ width: `${Math.round(Math.min(1, uploadProgress) * 100)}%` }}
            />
          </div>
        ) : null}
        {canPost ? (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => {
                setRefMenuOpen((o) => !o);
                if (!refMenuOpen) setRefQuery("");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 shadow-sm"
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              Reference
            </button>
            {refMenuOpen ? (
              <div className="mt-2 max-h-64 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs shadow-md">
                <div className="flex gap-0.5 overflow-x-auto border-b border-slate-100 bg-slate-50/90 px-1 py-1">
                  {INTERNAL_CHAT_REF_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setRefTab(k);
                        setRefQuery("");
                      }}
                      className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        refTab === k
                          ? "bg-white text-sky-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {refKindDisplayLabel(k)}
                    </button>
                  ))}
                </div>
                <div className="px-2 py-1.5">
                  <input
                    value={refQuery}
                    onChange={(e) => setRefQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <ul className="max-h-40 overflow-y-auto border-t border-slate-100">
                  {refLoading ? (
                    <li className="px-2 py-3 text-center text-slate-500">Loading…</li>
                  ) : refItems.length === 0 ? (
                    <li className="px-2 py-3 text-center text-slate-500">No matches.</li>
                  ) : (
                    refItems.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          className="w-full px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                          onClick={() => pickReference(refTab, it.id, it.label)}
                        >
                          {it.label}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`flex items-end gap-2 ${!canPost ? "pointer-events-none opacity-50" : ""}`}>
          <div className="flex shrink-0 flex-col gap-1">
            <label
              className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
              title="Attach photos or files"
            >
              <Paperclip className="h-4 w-4" />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept={CHAT_UPLOAD_ACCEPT}
                disabled={!canPost || sending}
                onChange={(e) => {
                  addPendingFromFileList(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label
              className="cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 sm:hidden"
              title="Camera"
            >
              <Camera className="h-4 w-4" />
              <input
                ref={cameraInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                disabled={!canPost || sending}
                onChange={(e) => {
                  addPendingFromFileList(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="Message… (type @ to mention a teammate)"
            disabled={!canPost}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-phone-border"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canPost || sending || !canSend}
            className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-phone-navy text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
