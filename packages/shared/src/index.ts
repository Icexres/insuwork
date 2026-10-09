// Shared constants. Amounts are integer USDC base units (6 decimals); never floats.
export const USDC_DECIMALS = 6;
export const PREMIUM_BPS = 300; // 3% to voucher (TEST-PLAN E-10: 180 on 6000)
export const FEE_BPS = 100; // 1% treasury (TEST-PLAN E-10: 60 on 6000)

// Integer math only: splits a milestone amount into partner/premium/fee.
export function splitMilestone(amount: number): { partner: number; premium: number; fee: number } {
  const premium = Math.floor((amount * PREMIUM_BPS) / 10_000);
  const fee = Math.floor((amount * FEE_BPS) / 10_000);
  return { partner: amount - premium - fee, premium, fee };
}
