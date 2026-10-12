import { test } from "node:test";
import assert from "node:assert/strict";
import { amountBand, releaseModeCode } from "../src/index.ts";

const usdc = (n: number) => BigInt(Math.round(n * 1_000_000));

test("OQ-26 bands: 8 bands, edges are lower-inclusive", () => {
  const cases: [number, number][] = [
    [0, 0], [49.999999, 0], [50, 1], [99.99, 1], [100, 2], [249, 2], [250, 3], [499, 3],
    [500, 4], [999, 4], [1_000, 5], [1_999, 5], [2_000, 6], [4_999, 6], [5_000, 7], [1e6, 7],
  ];
  for (const [amount, band] of cases) assert.equal(amountBand(usdc(amount)), band, `${amount} USDC`);
});

test("release_mode codes (SPEC §3)", () => {
  assert.equal(releaseModeCode("ApproveMilestone", "clientSig"), 0);
  assert.equal(releaseModeCode("OracleApprove", "githubOracle"), 1);
  assert.equal(releaseModeCode("CrankAutoRelease", "clientSig"), 2);
  assert.equal(releaseModeCode("Finalize"), 3);
});
