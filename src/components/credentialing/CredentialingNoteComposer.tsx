"use client";

import { appendCredentialingActivityNote } from "@/app/admin/credentialing/actions";

export function CredentialingNoteComposer({ credentialingId }: { credentialingId: string }) {
  return (
    <form action={appendCredentialingActivityNote} className="space-y-2">
      <input type="hidden" name="credentialing_id" value={credentialingId} />
      <textarea
        id={`credentialing-note-${credentialingId}`}
        name="activity_note"
        required
        rows={5}
        className="min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/80"
        placeholder="Log a call, email, or note…"
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const form = (e.currentTarget as HTMLTextAreaElement).form;
            if (form && e.currentTarget.value.trim()) {
              form.requestSubmit();
            }
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Enter to send · Shift+Enter for a new line</p>
        <button
          type="submit"
          className="rounded-xl border border-sky-600 bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Send
        </button>
      </div>
    </form>
  );
}
