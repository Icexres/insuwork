// Syntax-only checker: node --check every .js/.mjs (no deps installed yet).
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(mjs|cjs|js)$/.test(e)) out.push(p);
  }
  return out;
}

const files = walk(".");
let failed = 0;
for (const f of files) {
  try {
    execSync(`node --check "${f}"`, { stdio: "pipe" });
  } catch {
    console.error(`SYNTAX FAIL: ${f}`);
    failed++;
  }
}
console.log(failed === 0 ? `syntax ok (${files.length} files)` : `${failed} failures`);
process.exit(failed === 0 ? 0 : 1);
