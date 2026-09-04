import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { latestContiguousSession } from "./fetchKs200NightFutures";

describe("latestContiguousSession", () => {
  it("drops a leftover tick 12h before the current night session", () => {
    const stale = { t: Date.parse("2026-09-03T21:00:00Z"), v: 1049.05 };
    const night = [
      { t: Date.parse("2026-09-04T09:00:00Z"), v: 1055.7 },
      { t: Date.parse("2026-09-04T09:15:00Z"), v: 1056.1 },
      { t: Date.parse("2026-09-04T10:43:00Z"), v: 1050.05 },
    ];
    const out = latestContiguousSession([stale, ...night]);
    assert.equal(out.length, 3);
    assert.equal(out[0].t, night[0].t);
    assert.equal(out[out.length - 1].v, 1050.05);
  });

  it("keeps a single contiguous session", () => {
    const pts = [
      { t: 1_000, v: 1 },
      { t: 2_000, v: 2 },
      { t: 3_000, v: 3 },
    ];
    assert.deepEqual(latestContiguousSession(pts), pts);
  });
});
