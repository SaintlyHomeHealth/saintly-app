"use client";

type Props = {
  defaultQuery: string;
  /** Keeps desktop split-pane selection when filtering (optional `thread` query). */
  preserveThreadId?: string;
  /** Extra classes on the form (e.g. desktop inbox rail density). */
  className?: string;
};

/**
 * GET form for `/workspace/phone/inbox` — filters the conversation list.
 */
export function InboxSearchBar({ defaultQuery, preserveThreadId, className = "" }: Props) {
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
        className="ws-phone-input w-full rounded-full px-3 py-2 text-sm shadow-sm shadow-sky-950/5 ring-offset-0 lg:h-7 lg:min-h-[1.75rem] lg:rounded-md lg:border lg:border-slate-200/55 lg:bg-white lg:px-2.5 lg:py-0 lg:text-[12px] lg:leading-none lg:shadow-none lg:placeholder:text-slate-400"
      />
    </form>
  );
}
