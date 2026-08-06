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

  it("excludes macro and far-future earnings", () => {
    assert.equal(
      isEarningsContextNewsWindow(
        { kind: "macro", dateISO: new Date().toISOString() },
        new Date(),
      ),
      false,
    );
    const far = new Date(Date.now() + 5 * 24 * 3600_000).toISOString();
    assert.equal(
      isEarningsContextNewsWindow({ kind: "earnings", dateISO: far }, new Date()),
      false,
    );
  });
});
