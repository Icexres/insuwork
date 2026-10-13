// W-03 (rule 1): nothing reachable from /freelancer or the public profile may import wallet code.
// Follows local imports transitively, so a shared component that pulls in the adapter is caught too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FORBIDDEN = /^@solana\/wallet-adapter|^@\/components\/(wallet|wallet-tx|wallet-layout|e2e-wallet|voucher-actions|client-actions|dispute-actions)$/;

function resolveLocal(from: string, spec: string) {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function walletImports(entry: string) {
  const seen = new Set<string>();
  const bad: string[] = [];
  const visit = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, spec] of readFileSync(file, "utf8").matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!spec) continue;
      if (FORBIDDEN.test(spec)) bad.push([...chain, file, spec].map((x) => x.replace(ROOT, "")).join(" → "));
      const next = resolveLocal(file, spec);
      if (next) visit(next, [...chain, file]);
    }
  };
  visit(entry, []);
  return bad;
}

const pages = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? pages(join(dir, d.name)) : /\.(tsx?)$/.test(d.name) ? [join(dir, d.name)] : []));

test("W-03 no wallet code reachable from freelancer or public pages", () => {
  const entries = ["app/freelancer", "app/p"].flatMap((d) => pages(join(ROOT, d)));
  assert.ok(entries.length >= 4);
  assert.deepEqual(entries.flatMap(walletImports), []);
});

test("W-03 the check catches a violation", () => {
  assert.ok(walletImports(join(ROOT, "app/voucher/page.tsx")).length > 0, "voucher pages do use wallet code");
});
