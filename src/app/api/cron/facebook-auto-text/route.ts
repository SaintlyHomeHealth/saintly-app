import { NextResponse } from "next/server";

/**
 * Vercel cron for this path was removed (`vercel.json`). Facebook lead intro SMS now sends
 * immediately in `runFacebookLeadIntroSmsAfterInsert` when the lead is created.
 * Kept as 410 so old monitors/cron hits fail loudly without executing legacy logic.
 */
export const runtime = "nodejs";

function gone() {
  return NextResponse.json(
    {
      ok: false,
      error: "This cron was removed. Facebook lead intro SMS is sent immediately when the lead is created.",
    },
    { status: 410 }
  );
}

export const GET = gone;
export const POST = gone;
