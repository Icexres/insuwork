// W-09 (rule 1): freelancer and family copy never mentions crypto. Scans every string under those i18n keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const en = JSON.parse(readFileSync(new URL("../../../packages/shared/i18n/en.json", import.meta.url), "utf8"));
const strings = (v: unknown, path: string): [string, string][] =>
  typeof v === "string" ? [[path, v]] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`)) : [];

test("W-09 freelancer/family copy has no crypto words", () => {
  const banned = /\b(crypto\w*|usdc|wallets?|tokens?|solana)\b/i;
  const hits = [...strings(en.freelancer, "freelancer"), ...strings(en.family, "family")].filter(([, s]) => banned.test(s));
  assert.deepEqual(hits, []);
});
