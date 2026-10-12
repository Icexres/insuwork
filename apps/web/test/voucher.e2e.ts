// T-28: voucher pages render live devnet + mirror data. Needs dev server, local Supabase, and a
// previous `pnpm devnet:e2e` (its voucher wallet has a funded vault). Run: node --env-file=.env.local test/voucher.e2e.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP, service, signIn } from "./session.ts";

const { voucher } = JSON.parse(readFileSync("../../deployments/devnet-e2e-last.json", "utf8"));
const s = await signIn("voucher");
await service.from("wallet_links").delete().eq("wallet", voucher);
assert.equal((await service.from("wallet_links").insert({ user_id: s.id, wallet: voucher })).error, null);
const html = async (path: string) => {
  const r = await fetch(APP + path, { headers: { cookie: s.cookie } });
  assert.equal(r.status, 200, path);
  return (await r.text()).replace(/<!-- -->/g, "");
};

const dash = await html("/voucher/dashboard");
assert.ok(dash.includes("500.00"), "deposited 500 from chain");
assert.ok(dash.includes("24.00"), "premiums earned 24 from chain");
assert.ok(!dash.includes("Rajan Gurung"), "no demo fixture data");
const setup = await html("/voucher");
assert.ok(setup.includes("Deposit USDC"), "existing vault → deposit button");
const apps = await html("/voucher/applicants");
assert.ok(apps.includes("Applicant advisory reports"));
console.log("voucher pages: live data OK");
