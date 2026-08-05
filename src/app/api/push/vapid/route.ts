import { NextResponse } from "next/server";
import { getVapidPublicKey, vapidConfigured } from "@/lib/push/send";
import { pushStoreConfigured } from "@/lib/push/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!vapidConfigured() || !publicKey || !pushStoreConfigured()) {
    return NextResponse.json(
      { enabled: false, publicKey: null },
      { status: 200 },
    );
  }
  return NextResponse.json({ enabled: true, publicKey });
}
