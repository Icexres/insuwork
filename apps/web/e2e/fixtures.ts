// Shared E2E helpers: devnet funding, Supabase sessions as browser cookies, the dev-only test wallet.
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import bs58 from "bs58";
import { service, signIn } from "../test/session.ts";
import { resolve } from "node:path";

export const ROOT = resolve(process.cwd(), "../.."); // playwright runs from apps/web
export const en = JSON.parse(readFileSync(resolve(ROOT, "packages/shared/i18n/en.json"), "utf8"));
export { service };
export const key = (n: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(ROOT, `keys/${n}.json`), "utf8"))));
export const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const deployer = key("deployer");
const mint = key("test-usdc-mint").publicKey;

/** Public devnet RPC flakes (429s, lagging reads); setup steps are idempotent, so retry them. */
export async function retry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

/** SOL for fees/rent and test USDC, paid by the deployer (devnet only). */
export async function fund(kp: Keypair, sol: number, usdc = 0n) {
  await retry(() => sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({
    fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports: Math.round(sol * LAMPORTS_PER_SOL),
  })), [deployer], { commitment: "confirmed" }));
  if (usdc > 0n) {
    const ata = await retry(() => getOrCreateAssociatedTokenAccount(conn, deployer, mint, kp.publicKey, false, "confirmed"));
    await retry(() => mintTo(conn, deployer, mint, ata.address, deployer, usdc * 1_000_000n));
  }
}

/** A signed-in browser context for a role, optionally with the test wallet holding `wallet`. */
export async function actor(newContext: () => Promise<BrowserContext>, role: string, opts: { wallet?: Keypair; name?: string } = {}) {
  const s = await signIn(role);
  if (opts.name) await service.from("profiles").update({ display_name: opts.name }).eq("id", s.id);
  const ctx = await newContext();
  await ctx.addCookies(s.cookie.split("; ").map((c) => {
    const i = c.indexOf("=");
    return { name: c.slice(0, i), value: c.slice(i + 1), domain: "localhost", path: "/" };
  }));
  if (opts.wallet) {
    const secret = bs58.encode(opts.wallet.secretKey);
    await ctx.addInitScript(([sk, name]) => {
      localStorage.setItem("insuwork-e2e-wallet", sk);
      localStorage.setItem("walletName", JSON.stringify(name));
    }, [secret, "InsuWork E2E Test Wallet"]);
  }
  const page = await ctx.newPage();
  return { id: s.id, page };
}

/** SIWS through the real UI (wallet layout prompt). */
export async function bindWallet(page: Page, path: string) {
  await page.goto(path);
  const sign = page.getByRole("button", { name: en.auth.wallet.sign });
  await expect(sign).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  await sign.click();
  // WalletBind reloads the page after a successful bind; wait for the fresh, hydrated page
  await page.waitForEvent("load");
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  await expect(page.getByRole("heading", { name: en.auth.wallet.title, exact: true })).toBeHidden();
}

/** Wait for a wallet action's confirmation line. */
/** Wait for a wallet action to confirm. `orText`: the page's own success state, for forms that are replaced on refresh. */
export async function confirmed(page: Page, orText?: string) {
  const done = orText ? page.getByText(en.common.tx.done).last().or(page.getByText(orText).first()) : page.getByText(en.common.tx.done).last();
  const failed = page.getByText(new RegExp(en.common.tx.failed)).last();
  await expect(done.or(failed)).toBeVisible({ timeout: 150_000 });
  if (await failed.isVisible()) throw new Error(`wallet tx: ${await failed.textContent()}`);
}

/** Reload until `text` shows (mirror-backed pages catch up via the indexer). */
export async function reloadUntil(page: Page, text: string | RegExp, timeout = 180_000) {
  await expect.poll(async () => {
    await page.reload();
    return (await page.content()).replace(/<!-- -->/g, "");
  }, { timeout, intervals: [5_000, 10_000, 15_000] }).toMatch(text);
}

/** What GitHub would send when the PR is merged (signed with the webhook secret). */
export async function mergePr(baseURL: string, repo: string, pr: number) {
  const body = JSON.stringify({ action: "closed", number: pr, pull_request: { merged: true }, repository: { full_name: repo } });
  const sig = createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!).update(body).digest("hex");
  const r = await fetch(`${baseURL}/api/webhooks/github`, {
    method: "POST", body, headers: { "content-type": "application/json", "x-github-event": "pull_request", "x-hub-signature-256": `sha256=${sig}` },
  });
  return { status: r.status, body: await r.json() };
}

export const pk = (k: Keypair) => k.publicKey.toBase58();
export { Keypair, PublicKey };

const hydrated = (loc: Locator) => loc.page().waitForFunction(() => document.documentElement.dataset.hydrated === "1");

/** Hydration-safe fill/check: wait for hydration, then retry until the value sticks. */
export async function type(loc: Locator, value: string) {
  await hydrated(loc);
  await expect(async () => {
    await loc.fill(value);
    await expect(loc).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}
export async function tick(loc: Locator) {
  await hydrated(loc);
  await expect(async () => {
    await loc.check();
    await expect(loc).toBeChecked({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}
export async function pick(loc: Locator, value: string) {
  await hydrated(loc);
  await expect(async () => {
    await loc.selectOption(value);
    await expect(loc).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}
