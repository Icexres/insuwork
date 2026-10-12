// MOCK conversion partner helpers (rule 10: everything here is MOCK). Server-side only (node:crypto).
import { createHash, randomBytes } from "node:crypto";

/** MOCK FX: NPR paisa per 1 USDC (135.00 NPR). Display/demo only. */
export const MOCK_NPR_PAISA_PER_USDC = 13_500n;

/** USDC base units (6 dp) → NPR paisa, rounded down. */
export const mockNprPaisa = (usdcBaseUnits: bigint) => (usdcBaseUnits * MOCK_NPR_PAISA_PER_USDC) / 1_000_000n;

/** SPEC-attestation §1: sha256("insuwork:v1:" || kyc_id || salt), hex. */
export const freelancerRef = (kycId: string, salt: Uint8Array) =>
  createHash("sha256").update("insuwork:v1:").update(kycId).update(salt).digest("hex");

/** New MOCK KYC record. Salt stays server-side (partner_kyc, E-40). Only the last 4 account digits are kept. */
export function newMockKyc(bankName: string, accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  if (!bankName.trim() || digits.length < 4) throw new Error("bank name and account number required");
  const kycId = `MOCK-KYC-${randomBytes(6).toString("hex")}`;
  const salt = randomBytes(32);
  return { kycId, salt, freelancerRef: freelancerRef(kycId, salt), bankName: bankName.trim(), accountMasked: `••${digits.slice(-4)}` };
}
