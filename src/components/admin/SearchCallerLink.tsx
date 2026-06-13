import Link from "next/link";

type SearchCallerLinkProps = {
  phone: string | null | undefined;
  className?: string;
  label?: string;
  /** Admin shell vs workspace phone (nurses without admin access). */
  context?: "admin" | "workspace";
};

/** Pre-fills global search with a caller phone number. */
export function SearchCallerLink({
  phone,
  className = "rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100",
  label = "Search caller",
  context = "admin",
}: SearchCallerLinkProps) {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return null;

  const base = context === "workspace" ? "/workspace/phone/search" : "/admin/search";

  return (
    <Link
      href={`${base}?q=${encodeURIComponent(trimmed)}`}
      className={className}
      title="Search this number across leads, patients, calls, and more"
    >
      {label}
    </Link>
  );
}
