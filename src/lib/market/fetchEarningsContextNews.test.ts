import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEarningsContextNewsWindow } from "./fetchEarningsContextNews";

describe("isEarningsContextNewsWindow", () => {
  it("includes pre-earnings within 48h", () => {
    const dateISO = new Date(Date.now() + 12 * 3600_000).toISOString();
    assert.equal(
      isEarningsContextNewsWindow({ kind: "earnings", dateISO }, new Date()),
      true,
    );
  });

  it("includes post-print with EPS numbers within 36h", () => {
    const dateISO = new Date(Date.now() - 10 * 3600_000).toISOString();
    assert.equal(
      isEarningsContextNewsWindow(
        {
          kind: "earnings",
          dateISO,
          actual: { epsActual: 39.25, epsEstimate: 34.5 },
        },
        new Date(),
      ),
      true,
    );
  });

  it("includes post/awaiting window within 36h even without EPS numbers", () => {
    const dateISO = new Date(Date.now() - 10 * 3600_000).toISOString();
    assert.equal(
      isEarningsContextNewsWindow({ kind: "earnings", dateISO }, new Date()),
      true,
    );
  });

  it("includes same KST calendar day even before Yahoo clock", () => {
    // Build a same-KST-day afternoon stamp while "now" is morning KST.
    const now = new Date("2026-08-07T01:00:00.000Z"); // 10:00 KST
    const dateISO = "2026-08-07T06:00:00.000Z"; // 15:00 KST
    assert.equal(
      isEarningsContextNewsWindow({ kind: "earnings", dateISO }, now),
      true,
    );
  });
});
