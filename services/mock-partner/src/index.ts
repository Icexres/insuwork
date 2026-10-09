// Mock conversion partner stub (T-24). Every record is_mock=true, UI shows MOCK badge.
export const IS_MOCK = true;
export function mockPayout(amountUsdc: number): { is_mock: true; amountUsdc: number } {
  return { is_mock: true, amountUsdc };
}
