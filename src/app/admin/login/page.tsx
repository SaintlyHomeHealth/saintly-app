import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign in | Saintly Admin",
  description: "Staff sign in for Saintly Home Health admin",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Canonical staff sign-in path in SMS/email. Same form as /login (redirect keeps one UI).
 */
export default async function AdminLoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = sp.next;
  const nextStr = Array.isArray(next) ? next[0] : typeof next === "string" ? next : undefined;
  const q = new URLSearchParams();
  if (nextStr) q.set("next", nextStr);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(suffix ? `/login${suffix}` : "/login");
}
