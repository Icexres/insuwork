// T-21 end-to-end check against a running app + local Supabase (not part of `pnpm test`).
// Run: pnpm db:start; pnpm --filter @insuwork/web dev; node --env-file=.env.local test/auth.e2e.ts
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bs58 from "bs58";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const storageKey = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;

async function signIn(role: string | null) {
  const email = `e2e-${role}-${Date.now()}@test.local`;
  const password = "e2e-password-1";
  const { data: created, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await user.auth.signInWithPassword({ email, password });
  // @supabase/ssr cookie format: "base64-" + base64url(session JSON), chunked at 3180 chars
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const chunks = value.match(/.{1,3180}/g)!;
  const cookie = chunks.length === 1 ? `${storageKey}=${value}` : chunks.map((c, i) => `${storageKey}.${i}=${c}`).join("; ");
  if (role === "panelist" || role === "admin") await service.from("profiles").insert({ id: created.user.id, role });
  else if (role) assert.equal((await user.from("profiles").insert({ id: created.user.id, role })).error, null);
  return { id: created.user.id, cookie };
}

const get = async (path: string, cookie = "") => {
  const r = await fetch(APP + path, { headers: { cookie }, redirect: "manual" });
  return r.status === 200 ? "200" : new URL(r.headers.get("location")!, APP).pathname;
};
const post = (path: string, cookie: string, body: object) =>
  fetch(APP + path, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });

// route guard
assert.equal(await get("/client/freelancers"), "/login");
assert.equal(await get("/client/freelancers", (await signIn(null)).cookie), "/onboarding");
const homes = { freelancer: "/freelancer/home", family: "/family", voucher: "/voucher/dashboard", client: "/client/freelancers", panelist: "/panel", admin: "/admin" };
const sessions: Record<string, { id: string; cookie: string }> = {};
for (const [role, home] of Object.entries(homes)) {
  sessions[role] = await signIn(role);
  assert.equal(await get(home, sessions[role].cookie), "200", `${role} reaches ${home}`);
  const other = role === "client" ? "/voucher/dashboard" : "/client/freelancers";
  assert.equal(await get(other, sessions[role].cookie), home, `${role} bounced from ${other}`);
}

// SIWS: freelancer/family cannot bind (rule 1)
for (const role of ["freelancer", "family"]) assert.equal((await post("/api/auth/siws/nonce", sessions[role].cookie, { wallet: "x" })).status, 403);

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
