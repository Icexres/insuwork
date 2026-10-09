// T-04 harness stub: USDC mint metadata + clock warp helper (pure logic, no deps).
// Real LiteSVM/Bankrun wiring lands in Phase 2; this gives syntax+logic tests now.
export const TEST_USDC_DECIMALS = 6;
export const CLAIM_WINDOW_SECS = 14 * 24 * 3600; // 14-day window (E-08)
export const RULING_WINDOW_SECS = 7 * 24 * 3600; // 7-day ruling window

export function warpClock(nowSecs, deltaSecs) {
  return nowSecs + deltaSecs;
}

export function isClaimOpen(nowSecs, dueTs) {
  return nowSecs <= dueTs + CLAIM_WINDOW_SECS;
}
