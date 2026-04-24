"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  INTERNAL_CHAT_REF_KINDS,
  refComposerToken,
  refKindDisplayLabel,
  type InternalChatRefKind,
} from "@/lib/internal-chat/internal-chat-ref-kinds";
import { Bell, BellOff, ChevronLeft, Link2, Paperclip, Pin, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RefCard = {
  kind: InternalChatRefKind;
  id: string;
  label: string;
  href: string | null;
};

type PatientMentionCard = { id: string; label: string; href: string };

type Msg = {
  id: string;
  senderId: string;
  senderLabel: string;
  createdAt: string;
  body: string;
  attachmentPath: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    setMembersListHydrated(false);
    setMembers([]);
    setMembersPanelOpen(false);
    setMemberSearch("");
    setMemberSuggest([]);
  }, [chatId]);

  const loadMessages = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const showLoading = options?.showLoading === true;
      if (showLoading) setLoading(true);
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
    },
    [chatId]
  );

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
    const supabase = createBrowserSupabaseClient();
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
          void loadMessages();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, loadMessages]);

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
    if ((!t && rr.length === 0 && sp.length === 0) || sending) return;
    setSending(true);
    try {
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
        await loadMessages();
      }
    } finally {
      setSending(false);
    }
  }

  async function openAttachment(path: string) {
    const res = await fetch(`/api/workspace/internal-chat/attachment-url?path=${encodeURIComponent(path)}`);
    const json = (await res.json()) as { url?: string };
    if (json.url) {
      window.open(json.url, "_blank", "noopener,noreferrer");
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    const safe = file.name.replace(/[^\w.\-()+ ]/g, "_").slice(0, 120);
    const objectPath = `${chatId}/${crypto.randomUUID()}/${safe}`;
    const supabase = createBrowserSupabaseClient();
    const { error: upErr } = await supabase.storage.from("internal-chat").upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) {
      console.warn("[chat] upload", upErr.message);
      return;
    }
    setSending(true);
    try {
      await fetch(`/api/workspace/internal-chat/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "",
          staffMentions: [],
          patientMentions: [],
          referenceMentions: [],
          attachmentPath: objectPath,
          attachmentMime: file.type || "application/octet-stream",
          attachmentName: file.name,
        }),
      });
      await loadMessages();
    } finally {
      setSending(false);
    }
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
          const otherStyle = !mine ? otherBubbleStyleBySenderId.get(m.senderId) ?? null : null;
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
                  !mine
                    ? {
                        background: otherStyle!.background,
                        borderColor: otherStyle!.border,
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
                  {new Date(m.createdAt).toLocaleString(undefined, {
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
          <label className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <Paperclip className="h-4 w-4" />
            <input
              type="file"
              className="hidden"
              disabled={!canPost}
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
            />
          </label>
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
