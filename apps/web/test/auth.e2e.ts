// T-21 end-to-end check against a running app + local Supabase (not part of `pnpm test`).
// Run: pnpm db:start; pnpm --filter @insuwork/web dev; node --env-file=.env.local test/auth.e2e.ts
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import bs58 from "bs58";

import { APP, get, post, service, signIn } from "./session.ts";

// route guard
assert.equal(await get("/client/freelancers"), "/login");
assert.equal(await get("/client/freelancers", (await signIn(null)).cookie), "/onboarding");
const homes = { freelancer: "/freelancer/home", voucher: "/voucher/dashboard", client: "/client/freelancers", panelist: "/panel", admin: "/admin" };
const sessions: Record<string, { id: string; cookie: string }> = {};
for (const [role, home] of Object.entries(homes)) {
  sessions[role] = await signIn(role);
  assert.equal(await get(home, sessions[role].cookie), "200", `${role} reaches ${home}`);
  const other = role === "client" ? "/voucher/dashboard" : "/client/freelancers";
  assert.equal(await get(other, sessions[role].cookie), home, `${role} bounced from ${other}`);
}

// SIWS: freelancer cannot bind (rule 1)
for (const role of ["freelancer"]) assert.equal((await post("/api/auth/siws/nonce", sessions[role].cookie, { wallet: "x" })).status, 403);

// SIWS: client binds a wallet; nonce is single use; wrong key rejected
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const wallet = bs58.encode(publicKey.export({ format: "der", type: "spki" }).subarray(12));
const c = sessions.client.cookie;
const nonce = async () => (await (await post("/api/auth/siws/nonce", c, { wallet })).json()).message as string;

const bad = bs58.encode(sign(null, Buffer.from(await nonce()), generateKeyPairSync("ed25519").privateKey));
assert.equal((await post("/api/auth/siws/verify", c, { wallet, signature: bad })).status, 401);

const signature = bs58.encode(sign(null, Buffer.from(await nonce()), privateKey));
assert.equal((await post("/api/auth/siws/verify", c, { wallet, signature })).status, 200);
assert.equal((await post("/api/auth/siws/verify", c, { wallet, signature })).status, 400, "nonce replay");
const { data: link } = await service.from("wallet_links").select("wallet").eq("user_id", sessions.client.id).single();
assert.equal(link!.wallet, wallet);

// same wallet cannot be bound by a second profile
const v = sessions.voucher.cookie;
const msg2 = (await (await post("/api/auth/siws/nonce", v, { wallet })).json()).message;
assert.equal((await post("/api/auth/siws/verify", v, { wallet, signature: bs58.encode(sign(null, Buffer.from(msg2), privateKey)) })).status, 409);

// T-24 MOCK KYC: freelancer only, idempotent, masked, salt never returned
const fr = sessions.freelancer.cookie;
assert.equal((await post("/api/mock-partner/kyc", sessions.client.cookie, { bankName: "Nabil Bank", accountNumber: "1234567890" })).status, 403);
const k1 = await (await post("/api/mock-partner/kyc", fr, { bankName: "Nabil Bank", accountNumber: "1234-5678-90" })).json();
assert.match(k1.freelancer_ref, /^[0-9a-f]{64}$/);
assert.equal(k1.account_masked, "••7890");
assert.equal(k1.is_mock, true);
assert.equal(k1.salt, undefined);
const k2 = await (await post("/api/mock-partner/kyc", fr, { bankName: "Other", accountNumber: "9999" })).json();
assert.equal(k2.freelancer_ref, k1.freelancer_ref, "idempotent");
const { data: row } = await service.from("partner_kyc").select("salt, is_mock").eq("freelancer_user_id", sessions.freelancer.id).single();
assert.equal(row!.is_mock, true);
assert.ok(String(row!.salt).length > 60, "32-byte salt stored server-side");

console.log("auth + KYC e2e: all checks passed");
