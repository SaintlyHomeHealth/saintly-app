"use client";

type Props = {
  defaultQuery: string;
  /** Keeps desktop split-pane selection when filtering (optional `thread` query). */
  preserveThreadId?: string;
  /** Extra classes on the form (e.g. desktop inbox rail density). */
  className?: string;
  /** `rail` = compact inline search for the narrow desktop inbox rail (lg-only usage). */
  variant?: "default" | "rail";
};

/**
 * GET form for `/workspace/phone/inbox` — filters the conversation list.
 */
export function InboxSearchBar({ defaultQuery, preserveThreadId, className = "", variant = "default" }: Props) {
  if (variant === "rail") {
    return (
      <form
        method="get"
        action="/workspace/phone/inbox"
        className={`min-w-0 flex-1 ${className}`.trim()}
      >
        {preserveThreadId ? <input type="hidden" name="thread" value={preserveThreadId} /> : null}
        <input
          name="q"
          defaultValue={defaultQuery}
          placeholder="Search…"
          autoComplete="off"
          className="ws-phone-input h-7 w-full min-w-0 rounded-md border border-slate-200/50 bg-white px-2 text-[11px] leading-none text-slate-800 shadow-none placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-1 focus:ring-slate-300/60"
        />
      </form>
    );
  }

  return (
    <form
      method="get"
      action="/workspace/phone/inbox"
      className={`w-full min-[400px]:w-52 sm:w-60 ${className}`.trim()}
    >
      {preserveThreadId ? <input type="hidden" name="thread" value={preserveThreadId} /> : null}
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search name or number"
        className="ws-phone-input w-full rounded-full px-3 py-2 text-sm shadow-sm shadow-sky-950/5 ring-offset-0"
      />
    </form>
  );
}
