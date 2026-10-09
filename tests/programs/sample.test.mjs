import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { warpClock, isClaimOpen, CLAIM_WINDOW_SECS } from "./harness.mjs";

// Sample test: clock warp + E-10 worked example split (6000/180/60).
describe("scaffold", () => {
  it("warps past the 14-day claim window", () => {
    const due = 1_000_000;
    const after = warpClock(due, CLAIM_WINDOW_SECS + 1);
    assert.equal(isClaimOpen(after, due), false);
  });

  it("E-10 split: 1000 -> 30 premium, 10 fee, 960 partner", () => {
    const amount = 1000;
    const premium = Math.floor((amount * 300) / 10_000);
    const fee = Math.floor((amount * 100) / 10_000);
    assert.equal(premium, 30);
    assert.equal(fee, 10);
    assert.equal(amount - premium - fee, 960);
  });
});
