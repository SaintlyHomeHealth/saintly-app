import { NextRequest, NextResponse } from "next/server";

/** Optional Gmail Pub/Sub push endpoint — disabled unless GOOGLE_PUBSUB_TOPIC is configured. */
export async function POST(req: NextRequest) {
  const topic = process.env.GOOGLE_PUBSUB_TOPIC?.trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "Pub/Sub not configured." }, { status: 503 });
  }

  // Future: validate push token, decode notification, enqueue sync.
  await req.text().catch(() => "");
  return NextResponse.json({ ok: true, queued: false, note: "Push handler stub — polling sync remains active." });
}
