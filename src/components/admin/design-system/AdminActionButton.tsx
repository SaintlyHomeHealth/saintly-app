import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type AdminActionButtonVariant = "primary" | "secondary" | "ghost" | "call" | "text" | "danger" | "muted";
export type AdminActionButtonSize = "xs" | "sm" | "md";

type CommonProps = {
  children: ReactNode;
  variant?: AdminActionButtonVariant;
  size?: AdminActionButtonSize;
  className?: string;
  disabled?: boolean;
  title?: string;
};

const SIZE_CLS: Record<AdminActionButtonSize, string> = {
  xs: "px-1.5 py-0.5 text-[9px]",
  sm: "px-2 py-1 text-[10px]",
  md: "px-2.5 py-1.5 text-[11px]",
};

const VARIANT_CLS: Record<AdminActionButtonVariant, string> = {
  primary:
    "border-sky-600 bg-sky-600 text-white shadow-sm shadow-sky-200/50 hover:border-sky-700 hover:bg-sky-700",
  secondary:
    "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
  ghost:
    "border-transparent bg-transparent text-slate-600 shadow-none hover:border-slate-200 hover:bg-slate-50",
  call: "border-emerald-200 bg-emerald-50/90 text-emerald-900 shadow-sm hover:border-emerald-300 hover:bg-emerald-50",
  text: "border-sky-200 bg-sky-50/90 text-sky-900 shadow-sm hover:border-sky-300 hover:bg-sky-50",
  danger: "border-rose-200 bg-white text-rose-800 shadow-sm hover:border-rose-300 hover:bg-rose-50",
  muted: "border-slate-100 bg-slate-50 text-slate-400 shadow-none",
};

function buildCls(variant: AdminActionButtonVariant, size: AdminActionButtonSize, disabled?: boolean, extra = ""): string {
  const base = `inline-flex items-center justify-center rounded-lg border font-semibold transition ${SIZE_CLS[size]} ${VARIANT_CLS[variant]}`;
  if (disabled) {
    return `${base} cursor-not-allowed opacity-60 shadow-none ${extra}`.trim();
  }
  return `${base} hover:shadow-md ${extra}`.trim();
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function AdminActionButton({
  children,
  variant = "secondary",
  size = "sm",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button type="button" disabled={disabled} className={buildCls(variant, size, disabled, className)} {...props}>
      {children}
    </button>
  );
}

type LinkProps = CommonProps & {
  href: string;
  prefetch?: boolean;
};

export function AdminActionLink({
  children,
  href,
  variant = "secondary",
  size = "sm",
  className = "",
  disabled,
  prefetch = false,
  title,
}: LinkProps) {
  if (disabled) {
    return (
      <span className={buildCls("muted", size, true, className)} title={title}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} title={title} className={buildCls(variant, size, false, className)}>
      {children}
    </Link>
  );
}
