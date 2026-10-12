// T-31: panel + admin pages and routes against the last `scripts/devnet-claim.ts` dispute.
// Run: node --env-file=.env.local test/disputes.e2e.ts   (dev server + local Supabase)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP, post, service, signIn } from "./session.ts";

const last = JSON.parse(readFileSync("../../deployments/devnet-claim-last.json", "utf8"));
const devnet = JSON.parse(readFileSync("../../deployments/devnet.json", "utf8"));
const bind = async (role: string, wallet: string) => {
  const s = await signIn(role);
  await service.from("wallet_links").delete().eq("wallet", wallet);
  assert.equal((await service.from("wallet_links").insert({ user_id: s.id, wallet })).error, null);
  return s;
};
const html = async (path: string, cookie: string) => {
  const r = await fetch(APP + path, { headers: { cookie } });
  assert.equal(r.status, 200, path);
  return (await r.text()).replace(/<!-- -->/g, "");
};

// panelist who didn't vote: sees the claim, spec and evidence; it's finalized so no vote form
const p3 = await bind("panelist", last.unvoted);
const list = await html("/panel", p3.cookie);
assert.ok(list.includes(last.claim.slice(0, 4)) && list.includes("REJECTED"), "assigned claim listed with outcome");
const review = await html(`/panel/claims/${last.claim}`, p3.cookie);
assert.ok(review.includes(last.spec) && review.includes(last.statement), "spec + evidence statement shown");
assert.ok(!review.includes("Submit vote"), "no vote on a finalized claim");
const p1 = await bind("panelist", last.panel[0].wallet);
assert.ok((await html(`/panel/claims/${last.claim}`, p1.cookie)).includes("You voted: rejected"));
const outsider = await bind("panelist", "11111111111111111111111111111111");
assert.ok((await html(`/panel/claims/${last.claim}`, outsider.cookie)).includes("Applicant not found"), "non-panel wallet can't open it");

// admin bound to the config admin wallet sees live config and can act; others are read-only
const admin = await bind("admin", devnet.admin);
const cfg = await html("/admin", admin.cookie);
assert.ok(cfg.includes("3%") && cfg.includes("MOCK Conversion Partner") && !cfg.includes("Read-only"));
assert.ok(cfg.includes("Add panelist"));
const ro = await bind("admin", "11111111111111111111111111111111");
assert.ok((await html("/admin", ro.cookie)).includes("Read-only"));
const queue = await html("/admin/claims", admin.cookie);
assert.ok(queue.includes(last.claim.slice(0, 4)) && queue.includes("REJECTED"));
assert.ok((await html("/admin/keeper", admin.cookie)).includes("Run keeper now"));

// panelist route: admin only, wallet must exist on-chain
assert.equal((await post("/api/admin/panelists", p3.cookie, { wallet: last.unvoted, name: "x" })).status, 403);
assert.equal((await post("/api/admin/panelists", admin.cookie, { wallet: "11111111111111111111111111111111", name: "x" })).status, 400);
assert.equal((await post("/api/admin/panelists", admin.cookie, { wallet: last.unvoted, name: "Panelist C" })).status, 200);

// keeper cron route: bad secret rejected, good secret runs + logs
assert.equal((await fetch(`${APP}/api/keeper/run`, { method: "POST", headers: { authorization: "Bearer nope" } })).status, 401);
const run = await fetch(`${APP}/api/keeper/run`, { method: "POST", headers: { authorization: `Bearer ${process.env.KEEPER_RUN_SECRET}` } });
assert.equal(run.status, 200, await run.clone().text());
const { count } = await service.from("keeper_runs").select("id", { count: "exact", head: true });
assert.ok((count ?? 0) >= 1, "keeper run logged");
assert.ok((await html("/admin/keeper", admin.cookie)).includes("cron"), "run shows in the log");
console.log("panel + admin: OK");
