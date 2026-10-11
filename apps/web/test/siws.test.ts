import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import bs58 from "bs58";
import { nonceFresh, siwsMessage, verifySignature, NONCE_TTL_MS } from "../lib/siws.ts";

const walletOf = (pub: import("node:crypto").KeyObject) => bs58.encode(pub.export({ format: "der", type: "spki" }).subarray(12));

test("SIWS: accepts the wallet's signature, rejects tampering and other keys", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const wallet = walletOf(publicKey);
  const msg = siwsMessage("localhost:3000", wallet, "abc", new Date().toISOString());
  const sig = bs58.encode(sign(null, Buffer.from(msg), privateKey));
  assert.equal(verifySignature(wallet, msg, sig), true);
  assert.equal(verifySignature(wallet, msg.replace("abc", "abd"), sig), false);
  assert.equal(verifySignature(walletOf(generateKeyPairSync("ed25519").publicKey), msg, sig), false);
  assert.equal(verifySignature("not-base58!", msg, sig), false);
});

test("SIWS: nonce expires", () => {
  const t = new Date(0).toISOString();
  assert.equal(nonceFresh(t, NONCE_TTL_MS - 1), true);
  assert.equal(nonceFresh(t, NONCE_TTL_MS), false);
});
