// T-21: Sign-In With Solana message + ed25519 check (node:crypto, no extra deps).
import { createPublicKey, verify } from "node:crypto";
import bs58 from "bs58";

export const NONCE_TTL_MS = 5 * 60_000;

export const siwsMessage = (domain: string, wallet: string, nonce: string, issuedAt: string) =>
  `${domain} wants you to sign in with your Solana account:\n${wallet}\n\n` +
  `Bind this wallet to your InsuWork profile. No transaction, no fees.\n\n` +
  `Nonce: ${nonce}\nIssued At: ${issuedAt}`;

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySignature(wallet: string, message: string, signature: string): boolean {
  try {
    const pk = bs58.decode(wallet);
    if (pk.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, pk]), format: "der", type: "spki" });
    return verify(null, Buffer.from(message), key, bs58.decode(signature));
  } catch {
    return false;
  }
}

export const nonceFresh = (issuedAt: string, now = Date.now()) => now - Date.parse(issuedAt) < NONCE_TTL_MS;
