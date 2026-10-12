import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { freelancerRef, mockNprPaisa, newMockKyc } from "../src/mock-partner.ts";

test("freelancer_ref follows SPEC-attestation §1", () => {
  const salt = Buffer.alloc(32, 1);
  const expected = createHash("sha256").update(Buffer.concat([Buffer.from("insuwork:v1:K1"), salt])).digest("hex");
  assert.equal(freelancerRef("K1", salt), expected);
});

test("MOCK KYC keeps only the last 4 digits; refs are unique", () => {
  const a = newMockKyc("Nabil Bank", "0123-4567-8901");
  const b = newMockKyc("Nabil Bank", "0123-4567-8901");
  assert.equal(a.accountMasked, "••8901");
  assert.ok(!JSON.stringify(a).includes("01234567"));
  assert.match(a.kycId, /^MOCK-KYC-/);
  assert.notEqual(a.freelancerRef, b.freelancerRef);
  assert.throws(() => newMockKyc("", "12345"));
});

test("MOCK FX uses integer math", () => {
  assert.equal(mockNprPaisa(1_000_000_000n), 13_500_000n); // 1,000 USDC → NPR 135,000.00
  assert.equal(mockNprPaisa(1n), 0n);
});
