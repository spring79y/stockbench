import { NextResponse } from "next/server";
import { upsertPushSubscription, removePushMarket, pushStoreConfigured } from "@/lib/push/store";
import { vapidConfigured } from "@/lib/push/send";
import type { PushMarket } from "@/lib/push/types";

export const dynamic = "force-dynamic";

function parseMarket(raw: unknown): PushMarket | null {
  return raw === "kr" || raw === "us" ? raw : null;
}

export async function POST(req: Request) {
  if (!vapidConfigured() || !pushStoreConfigured()) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }

  const body = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    market?: string;
  };

  const market = parseMarket(body.market);
  if (!market || !body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await upsertPushSubscription({
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    market,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true, market });
}

export async function DELETE(req: Request) {
  if (!pushStoreConfigured()) {
    return NextResponse.json({ error: "push not configured" }, { status: 503 });
  }

  const body = (await req.json()) as { endpoint?: string; market?: string };
  const market = parseMarket(body.market);
  if (!market || !body.endpoint) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const result = await removePushMarket({ endpoint: body.endpoint, market });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
