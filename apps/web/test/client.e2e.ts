// T-29: client pages render live data, and the meta / evidence routes enforce ownership + on-chain hashes.
// Needs dev server, local Supabase, and a previous `pnpm devnet:e2e`. Run: node --env-file=.env.local test/client.e2e.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP, post, service, signIn } from "./session.ts";

const last = JSON.parse(readFileSync("../../deployments/devnet-e2e-last.json", "utf8"));
const commitment: string = last.commitment.address;
const s = await signIn("client");
await service.from("wallet_links").delete().eq("wallet", last.client);
assert.equal((await service.from("wallet_links").insert({ user_id: s.id, wallet: last.client })).error, null);
const html = async (path: string) => {
  const r = await fetch(APP + path, { headers: { cookie: s.cookie } });
  assert.equal(r.status, 200, path);
  return (await r.text()).replace(/<!-- -->/g, "");
};

// meta route: wrong spec text is rejected, the real one is stored
assert.equal((await post("/api/commitments/meta", s.cookie, { commitment, specs: [{ index: 0, markdown: "tampered" }] })).status, 400);
const ok = await post("/api/commitments/meta", s.cookie, {
  commitment, specs: last.specs.map((markdown: string, index: number) => ({ index, markdown })),
  github: [{ index: 1, repo: last.github.repo, pr: last.github.pr }],
});
assert.equal(ok.status, 200, await ok.text());

// another client can't write to this commitment
const other = await signIn("client");
await service.from("wallet_links").insert({ user_id: other.id, wallet: "11111111111111111111111111111111" });
assert.equal((await post("/api/commitments/meta", other.cookie, { commitment, specs: [] })).status, 403);
assert.equal((await post("/api/claims/evidence", other.cookie, { commitment, index: 0, statement: "x".repeat(30) })).status, 403);

const index = await html("/client/commitments");
assert.ok(index.includes(commitment.slice(0, 4)), "commitment listed");
const timeline = await html(`/client/commitments/${commitment}`);
assert.ok(timeline.includes("932.00"), "total required from chain");
assert.ok(timeline.includes("NPR 54,000"), "MOCK payout shown");
assert.ok(timeline.includes(last.specs[0].slice(0, 20)), "spec markdown shown");
assert.ok(timeline.includes("Paid Delivery Record"), "attestation linked");
assert.ok(!timeline.includes("Northwind"), "no demo fixture data");
const browse = await html("/client/freelancers");
assert.ok(browse.includes("paid deliveries"));
const wizard = await html("/client/new");
assert.ok(wizard.includes("Continue"));
assert.equal((await fetch(`${APP}/client/commitments/${commitment}`, { headers: { cookie: other.cookie } }).then((r) => r.text())).includes("932.00"), false, "other client can't see it");
console.log("client pages + routes: OK");
