"use client";

import { appendRecruitingTimelineNote } from "@/app/admin/recruiting/actions";

export function RecruitingNoteComposer({ candidateId }: { candidateId: string }) {
  return (
    <form action={appendRecruitingTimelineNote} className="space-y-2">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <textarea
        id={`recruiting-note-${candidateId}`}
        name="note"
        required
        rows={3}
        className="min-h-[88px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-[15px] leading-relaxed text-slate-900 shadow-inner placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/80"
        placeholder="Log a call note, text outcome, or context…"
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const el = e.currentTarget as HTMLTextAreaElement;
            const form = el.form;
            if (form && el.value.trim()) {
              form.requestSubmit();
            }
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Enter to save · Shift+Enter for a new line</p>
        <button
          type="submit"
          className="rounded-xl border border-sky-600 bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          Add note
        </button>
      </div>
    </form>
  );
}
