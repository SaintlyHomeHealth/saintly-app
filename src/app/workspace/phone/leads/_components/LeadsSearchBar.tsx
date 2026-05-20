"use client";

type Props = {
  defaultQuery: string;
  className?: string;
};

/**
 * GET `/workspace/phone/leads?q=…` — matches inbox search styling.
 */
export function LeadsSearchBar({ defaultQuery, className = "" }: Props) {
  return (
    <form method="get" action="/workspace/phone/leads" className={`w-full min-[400px]:w-52 sm:w-60 ${className}`.trim()}>
      <input
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search name, phone, or agent"
        autoComplete="off"
        className="ws-phone-input w-full rounded-full px-3 py-2 text-sm shadow-sm shadow-sky-950/5 ring-offset-0"
      />
    </form>
  );
}
