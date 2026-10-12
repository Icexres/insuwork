// Screenshots of the real internal pages for the landing page + reel (public/landing/*.jpg).
// Picks the richest existing persona per role in the local DB (seed:demo / E2E runs) and signs in with a
// magic-link token — no passwords are set. Prereqs: local Supabase with data, `next dev -p 3123` running.
// Run (apps/web): node --env-file=.env.local scripts/landing-shots.ts
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP_URL ?? "http://localhost:3123";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const storageKey = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token`;
const OUT = "public/landing";

const most = <T>(xs: T[]) => {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([x]) => x);
};
async function userOfWallet(wallets: string[]) {
  for (const w of wallets) {
    const { data } = await db.from("wallet_links").select("user_id").eq("wallet", w).maybeSingle();
    if (data) return data.user_id as string;
  }
  throw new Error("no linked user");
}
async function cookieFor(userId: string) {
  const { data: u } = await db.auth.admin.getUserById(userId);
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: u.user!.email! });
  if (error) throw error;
  const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  return value.match(/.{1,3180}/g)!.map((v, i, all) => ({ name: all.length === 1 ? storageKey : `${storageKey}.${i}`, value: v, domain: "localhost", path: "/" }));
}

// Richest personas.
const { data: released } = await db.from("milestones").select("commitment, commitments!inner(client, freelancer_ref)").eq("status", "released");
const rel = (released ?? []) as unknown as { commitment: string; commitments: { client: string; freelancer_ref: string } }[];
// the commitment with the most releases whose client wallet is still linked to a user
const { data: links } = await db.from("wallet_links").select("wallet");
const linked = new Set((links ?? []).map((l) => l.wallet));
const commitment = most(rel.filter((m) => linked.has(m.commitments.client)).map((m) => m.commitment))[0];
const client = await userOfWallet([rel.find((m) => m.commitment === commitment)!.commitments.client]);
const { data: kycs } = await db.from("partner_kyc").select("freelancer_ref, freelancer_user_id");
const ref = most(rel.map((m) => m.commitments.freelancer_ref)).find((r) => kycs?.some((k) => k.freelancer_ref === r))!;
const kyc = kycs!.find((k) => k.freelancer_ref === ref);
const { data: backings } = await db.from("backings").select("vaults(voucher)");
const voucher = await userOfWallet(most((backings ?? []).map((b) => (b.vaults as unknown as { voucher: string }).voucher)));
const { data: claims } = await db.from("claims").select("pubkey, panel, votes").order("filed_ts", { ascending: false });
const claim = (claims ?? []).sort((a, b) => Object.keys(b.votes ?? {}).length - Object.keys(a.votes ?? {}).length)[0];
const panelist = await userOfWallet(claim.panel);

const shots: [name: string, user: string | null, path: string][] = [
  ["voucher-dashboard", voucher, "/voucher/dashboard"],
  ["client-commitment", client, `/client/commitments/${commitment}`],
  ["freelancer-home", kyc?.freelancer_user_id ?? null, "/freelancer/home"],
  ["public-profile", null, `/p/${ref}`],
  ["panel-claim", panelist, `/panel/claims/${claim.pubkey}`],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, user, path] of shots) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  if (user) await ctx.addCookies(await cookieFor(user));
  const page = await ctx.newPage();
  await page.goto(APP + path, { waitUntil: "load", timeout: 180_000 });
  if (new URL(page.url()).pathname !== path) throw new Error(`${name}: redirected to ${page.url()}`);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  await page.waitForTimeout(1500); // fonts + client fetches settle
  // E2E accounts have throwaway addresses (e2e-…@test.local) and per-run name suffixes ("Sita T. 55605");
  // keep both out of marketing images.
  await page.evaluate(() => {
    document.querySelectorAll("p, span").forEach((el) => {
      if (/^e2e-.*@test\.local$/.test(el.textContent?.trim() ?? "")) (el as HTMLElement).style.visibility = "hidden";
    });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeValue = n.nodeValue!.replace(/(Sita T\.) \d{5}\b/g, "$1");
  });
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82 });
  console.log(name, path);
  await ctx.close();
}
await browser.close();
