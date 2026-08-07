import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATCHUP_STALE_THRESHOLD_MINS,
  collectPublishEvidence,
  decideCatchUp,
  isSlotStale,
  markCatchUpDispatched,
  minsPastSlot,
  slotPublishedOnDay,
} from "./catchup";
import type { PublishedBundle } from "./types";

/** Build a Date for a Seoul wall-clock time (KST = UTC+9). */
function kst(ymd: string, hour: number, minute: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute, 0));
}

function bundleWith(
  entries: Array<{ slot: PublishedBundle["slot"]; publishedAt: string; scope?: "all" | "kr" | "us" }>,
): PublishedBundle {
  const last = entries[entries.length - 1]!;
  const emptyView = {
    briefing: { headline: "", bullets: [] as string[], evidenceIds: [] as string[] },
    scenarios: [],
    checkItems: [],
  };
  const views: PublishedBundle["views"] = {
    all: { ...emptyView },
    kr: { ...emptyView },
    us: { ...emptyView },
  };
  for (const e of entries) {
    const scope = e.scope ?? (e.slot.startsWith("kr-") ? "kr" : "us");
    views[scope] = {
      ...emptyView,
      slot: e.slot,
      publishedAt: e.publishedAt,
    };
    if (scope !== "all") {
      views.all = {
        ...emptyView,
        slot: e.slot,
        publishedAt: e.publishedAt,
      };
    }
  }
  return {
    version: 2,
    slot: last.slot,
    publishedAt: last.publishedAt,
    source: "pipeline",
    mode: "full",
    market: {
      temperature: "",
      mood: "mixed",
      moodLabel: "",
      asOfLabel: "",
    },
    views,
    events: [],
    guard: { ok: true, findings: [] },
  };
}

describe("minsPastSlot / isSlotStale", () => {
  it("is negative before slot time and stale after threshold within max lateness", () => {
    const before = kst("2026-08-07", 15, 39); // Fri before kr-post 15:40
    assert.ok(minsPastSlot("kr-post", before) < 0);
    assert.equal(isSlotStale("kr-post", before), false);

    const justAfter = kst("2026-08-07", 16, 20); // +40m
    assert.equal(isSlotStale("kr-post", justAfter), false);

    const stale = kst("2026-08-07", 16, 25); // +45m
    assert.equal(minsPastSlot("kr-post", stale), CATCHUP_STALE_THRESHOLD_MINS);
    assert.equal(isSlotStale("kr-post", stale), true);

    const tooLate = kst("2026-08-07", 19, 0); // +3h20m past kr-post
    assert.equal(isSlotStale("kr-post", tooLate), false);
  });
});

describe("slotPublishedOnDay", () => {
  it("matches Seoul calendar day from publishedAt", () => {
    const publishedAt = kst("2026-08-07", 16, 0).toISOString();
    const evidence = collectPublishEvidence(
      bundleWith([{ slot: "kr-post", publishedAt, scope: "kr" }]),
    );
    assert.equal(slotPublishedOnDay("kr-post", "2026-08-07", evidence), true);
    assert.equal(slotPublishedOnDay("kr-post", "2026-08-06", evidence), false);
    assert.equal(slotPublishedOnDay("us-pre", "2026-08-07", evidence), false);
  });
});

describe("decideCatchUp", () => {
  it("skips weekends", () => {
    const sat = kst("2026-08-08", 12, 0); // Saturday
    const d = decideCatchUp({ now: sat, bundle: null });
    assert.equal(d.target, null);
    assert.match(d.reason, /weekend/);
  });

  it("requests morning when us-post/kr-pre missing after 45m", () => {
    const now = kst("2026-08-07", 7, 45);
    const d = decideCatchUp({ now, bundle: null });
    assert.equal(d.target, "morning");
    assert.ok(d.staleSlots.includes("us-post"));
    assert.ok(d.staleSlots.includes("kr-pre"));
  });

  it("does not catch up morning when both published today", () => {
    const now = kst("2026-08-07", 8, 0);
    const bundle = bundleWith([
      { slot: "us-post", publishedAt: kst("2026-08-07", 7, 5).toISOString(), scope: "us" },
      { slot: "kr-pre", publishedAt: kst("2026-08-07", 7, 12).toISOString(), scope: "kr" },
    ]);
    const d = decideCatchUp({ now, bundle });
    assert.equal(d.target, null);
  });

  it("requests noon when only us-noon missing", () => {
    const now = kst("2026-08-07", 13, 20);
    const bundle = bundleWith([
      { slot: "us-post", publishedAt: kst("2026-08-07", 7, 5).toISOString(), scope: "us" },
      { slot: "kr-pre", publishedAt: kst("2026-08-07", 7, 12).toISOString(), scope: "kr" },
      { slot: "kr-mid", publishedAt: kst("2026-08-07", 12, 40).toISOString(), scope: "kr" },
    ]);
    const d = decideCatchUp({ now, bundle });
    assert.equal(d.target, "noon");
    assert.deepEqual(
      d.staleSlots.filter((s) => s === "us-noon" || s === "kr-mid"),
      ["us-noon"],
    );
  });

  it("dedups once per target per Seoul day", () => {
    const now = kst("2026-08-07", 16, 30);
    const state = markCatchUpDispatched(null, "kr-post", now);
    const d = decideCatchUp({ now, bundle: null, state });
    assert.equal(d.target, null);
    assert.match(d.reason, /already catch-up-dispatched/);
  });

  it("prefers earliest stale target in the lateness window", () => {
    // 13:20 — noon window; morning is past max lateness, noon is in window
    const now = kst("2026-08-07", 13, 20);
    const d = decideCatchUp({ now, bundle: null });
    assert.equal(d.target, "noon");
  });
});
