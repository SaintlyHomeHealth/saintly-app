import Link from "next/link";

type AdmissionsNavLinkProps = {
  className?: string;
  label?: string;
};

export function AdmissionsNavLink({
  className = "inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900",
  label = "Admission Handoffs",
}: AdmissionsNavLinkProps) {
  return (
    <Link href="/admin/intake/admissions" className={className}>
      {label}
    </Link>
  );
}
