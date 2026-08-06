import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { PublishedBundle } from "@/lib/pipeline/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** Lightweight publish meta for deploy wait + PWA freshness checks. */
export async function GET() {
  try {
    const raw = await readFile(join(process.cwd(), "src/data/published/latest.json"), "utf8");
    const bundle = JSON.parse(raw) as PublishedBundle;
    return NextResponse.json(
      {
        publishedAt: bundle.publishedAt ?? null,
        slot: bundle.slot ?? null,
        views: {
          all: { publishedAt: bundle.views?.all?.publishedAt ?? null },
          kr: { publishedAt: bundle.views?.kr?.publishedAt ?? null },
          us: { publishedAt: bundle.views?.us?.publishedAt ?? null },
        },
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { publishedAt: null, slot: null, views: null },
      { status: 404, headers: NO_STORE },
    );
  }
}
