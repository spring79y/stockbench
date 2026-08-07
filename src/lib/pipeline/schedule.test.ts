import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextSlotForScope } from "./schedule";

/** Build a Date for a Seoul wall-clock time (KST = UTC+9). */
function kst(ymd: string, hour: number, minute: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute, 0));
}

describe("nextSlotForScope", () => {
  it("after morning publish, next KR is noon even past 12:30 if noon missing", () => {
    const now = kst("2026-08-07", 13, 52);
    const next = nextSlotForScope("kr", now, {
      slot: "kr-pre",
      publishedAt: kst("2026-08-07", 9, 20).toISOString(),
    });
    assert.equal(next?.slot, "kr-mid");
    assert.match(next?.whenLabel ?? "", /12:30$/);
  });

  it("after morning publish before noon, next KR is 12:30", () => {
    const now = kst("2026-08-07", 10, 0);
    const next = nextSlotForScope("kr", now, {
      slot: "kr-pre",
      publishedAt: kst("2026-08-07", 9, 20).toISOString(),
    });
    assert.equal(next?.slot, "kr-mid");
  });

  it("after noon publish, next KR is 15:40", () => {
    const now = kst("2026-08-07", 14, 0);
    const next = nextSlotForScope("kr", now, {
      slot: "kr-mid",
      publishedAt: kst("2026-08-07", 12, 40).toISOString(),
    });
    assert.equal(next?.slot, "kr-post");
    assert.match(next?.whenLabel ?? "", /15:40$/);
  });

  it("US after us-post, next is us-noon not us-pre when past 12:30", () => {
    const now = kst("2026-08-07", 13, 52);
    const next = nextSlotForScope("us", now, {
      slot: "us-post",
      publishedAt: kst("2026-08-07", 9, 16).toISOString(),
    });
    assert.equal(next?.slot, "us-noon");
  });

  it("without lastPublished, wall-clock skips past noon to kr-post", () => {
    const now = kst("2026-08-07", 13, 52);
    const next = nextSlotForScope("kr", now);
    assert.equal(next?.slot, "kr-post");
  });
});
