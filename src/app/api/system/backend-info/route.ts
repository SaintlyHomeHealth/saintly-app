import { NextResponse } from "next/server";

export const runtime = "nodejs";

function supabaseProjectRef(): string | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

/** Safe fingerprint to confirm two domains hit the same deployment + Supabase project. */
export async function GET() {
  return NextResponse.json({
    supabaseProjectRef: supabaseProjectRef(),
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
