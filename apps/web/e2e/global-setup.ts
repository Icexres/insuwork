// Runs the indexer (with attester + MOCK partner keys) beside the test run, like production would.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bs58 from "bs58";

const root = resolve(process.cwd(), "../..") + "/"; // playwright runs from apps/web
const b58 = (n: string) => bs58.encode(Uint8Array.from(JSON.parse(readFileSync(`${root}keys/${n}.json`, "utf8"))));

export default async function globalSetup() {
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GITHUB_WEBHOOK_SECRET", "AI_PROVIDER"]) {
    if (!process.env[k]) throw new Error(`${k} missing: run with --env-file=.env.local (pnpm e2e does)`);
  }
  const deployer = JSON.parse(readFileSync(`${root}deployments/devnet.json`, "utf8")).admin as string;
  const indexer = spawn(process.execPath, [`${root}services/indexer/src/index.ts`], {
    cwd: root,
    env: {
      ...process.env, SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL, INDEXER_POLL_SECS: "15",
      ATTESTER_SECRET_KEY: b58("attester"), MOCK_PARTNER_SECRET_KEY: b58("mock-partner"), SAS_CREDENTIAL_AUTHORITY: deployer,
    },
    stdio: "ignore",
  });
  return async () => {
    indexer.kill();
  };
}
