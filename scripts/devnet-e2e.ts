// One full commitment on devnet through every Phase-3 back-end piece, then prints the real numbers.
//   voucher bond → 2-milestone commitment with a retention vest → client approves M0 →
//   M1 released by the GitHub webhook route (oracle) → keeper releases the vest →
//   indexer mirrors + delivery attestations + MOCK payouts / NPR attestations.
// Needs: local Supabase (pnpm db:start), web dev server with GITHUB_WEBHOOK_SECRET + GITHUB_ORACLE_SECRET_KEY,
// and `pnpm sas:setup` done. Run from repo root: node --env-file=apps/web/.env.local scripts/devnet-e2e.ts
import { createHash, createHmac } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import * as sdk from "../packages/sdk/src/index.ts";
import * as indexer from "../services/indexer/src/index.ts";
import * as fx from "../services/indexer/src/effects.ts";
import { keeperPass } from "../services/keeper/src/index.ts";
import { chainKeeperDeps } from "../services/keeper/src/chain.ts";

const { BN } = anchor;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const REPO = "insuwork/devnet-e2e";
const PR = Math.floor(Date.now() / 1000); // unique per run: a PR links to one milestone
const key = (n: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`keys/${n}.json`, "utf8"))));
const usd = (n: bigint | string | number) => (Number(n) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const deployer = key("deployer");
const mint = key("test-usdc-mint").publicKey;
const partner = key("mock-partner");
const attester = key("attester");
if (!existsSync("keys/keeper.json")) writeFileSync("keys/keeper.json", JSON.stringify([...Keypair.generate().secretKey]));
const keeper = key("keeper");
const oracle = key("github-oracle");
const p = sdk.programs(new anchor.AnchorProvider(conn, new anchor.Wallet(deployer), { commitment: "confirmed" }));
const send = (ixs: TransactionInstruction[], signers: Keypair[]) =>
  sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });
const step = (s: string) => console.log(`\n▶ ${s}`);

// ── actors ──────────────────────────────────────────────────────────
step("fund actors (SOL from deployer, test USDC minted)");
const voucher = Keypair.generate();
const client = Keypair.generate();
const topUp = [[voucher, 0.05], [client, 0.08], [keeper, 0.02], [oracle, 0.02]] as const;
await send(topUp.filter(([, sol]) => sol).map(([kp, sol]) =>
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports: sol * LAMPORTS_PER_SOL })), [deployer]);
const voucherAta = (await getOrCreateAssociatedTokenAccount(conn, deployer, mint, voucher.publicKey)).address;
const clientAta = (await getOrCreateAssociatedTokenAccount(conn, deployer, mint, client.publicKey)).address;
await mintTo(conn, deployer, mint, voucherAta, deployer, 500_000_000n);
await mintTo(conn, deployer, mint, clientAta, deployer, 2_000_000_000n);
console.log({ voucher: voucher.publicKey.toBase58(), client: client.publicKey.toBase58() });

// ── voucher bond ────────────────────────────────────────────────────
step("voucher: vault, 500 USDC bond, backing (cap 500)");
const REF = createHash("sha256").update(`insuwork:v1:e2e:${Date.now()}`).digest(); // stand-in freelancer_ref (no PII)
const vault = sdk.pdas.vault(voucher.publicKey);
const backing = sdk.pdas.backing(vault, REF);
await send([
  ...(await sdk.initVaultAndDepositIxs(p, voucher.publicKey, mint, sdk.usdc(500))),
  await sdk.createBackingIx(p, voucher.publicKey, REF, sdk.usdc(500)),
], [voucher]);

// ── commitment ──────────────────────────────────────────────────────
step("client: commitment (2 milestones × 400 USDC, vest 100 USDC after 20 s), M1 released by GitHub oracle");
const now = Math.floor(Date.now() / 1000);
const SPECS = ["Landing page: hero, pricing, signup form; Lighthouse ≥ 90 on mobile.", "Dashboard analytics module with date-range CSV export."];
const cfg = await p.escrow.account.escrowConfig.fetch(sdk.pdas.escrowConfig());
const vestAmount = 100_000_000n;
const expected = [400_000_000n, 400_000_000n].reduce((a, x) => a + sdk.clientDue(x, cfg.premiumBps, cfg.platformFeeBps, 0).clientDue, vestAmount);
const { commitment, groups } = await sdk.createCommitmentIxGroups(p, {
  client: client.publicKey, id: 1n, freelancerRef: REF, partner: partner.publicKey, mint, backings: [{ vault, backing }],
  share: false, vestAmount: new BN(vestAmount.toString()), vestDelaySecs: 20, fundAmount: new BN(expected.toString()),
  milestones: [
    { amount: sdk.usdc(400), dueTs: now + 7 * 86400, specHash: sdk.specHash(SPECS[0]) },
    { amount: sdk.usdc(400), dueTs: now + 7 * 86400, specHash: sdk.specHash(SPECS[1]), githubRef: { repo: REPO, pr: PR } },
  ],
});
for (const g of groups) await send(g, [client]);
const total = (await p.escrow.account.commitment.fetch(commitment)).totalRequired;
if (BigInt(total.toString()) !== expected) throw new Error(`clientDue mismatch: sdk ${expected} vs chain ${total}`);
console.log(`funded ${usd(total)} USDC  (${commitment.toBase58()})`);

const c = await sdk.loadCommitment(p, commitment);
step("M0: activate (locks bond) → client approves");
await send([await sdk.activateMilestoneIx(p, c, 0)], [client]);
const m0Sig = await send([await sdk.approveMilestoneIx(p, c, 0)], [client]);

step("M1: activate → indexer mirrors → github_links → signed merged-PR webhook");
await send([await sdk.activateMilestoneIx(p, c, 1)], [client]);
const ctx = indexer.context(conn, db);
const settle = async () => {
  await sleep(2000);
  await indexer.poll(ctx, conn);
};
await settle();
const m1 = sdk.pdas.milestone(commitment, 1).toBase58();
const { error: linkErr } = await db.from("github_links").upsert({ milestone_pubkey: m1, repo: REPO, pr_number: PR, ref_hash: sdk.githubRefHash(REPO, PR).toString("hex") });
if (linkErr) throw new Error(linkErr.message);
const body = JSON.stringify({ action: "closed", number: PR, pull_request: { merged: true }, repository: { full_name: REPO } });
const hook = (b: string) => fetch(`${APP}/api/webhooks/github`, { method: "POST", body: b, headers: {
  "content-type": "application/json", "x-github-event": "pull_request",
  "x-hub-signature-256": `sha256=${createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!).update(b).digest("hex")}`,
} }).then(async (r) => ({ status: r.status, body: await r.json() }));
const first = await hook(body);
console.log("webhook:", first);
if (first.status !== 200 || !first.body.tx) throw new Error("webhook did not approve");
console.log("redelivery:", await hook(body));

step("keeper: wait for vest due, release it");
await sleep(25_000);
await settle(); // keeper candidates come from the mirror; the indexer must have seen the completion
console.log("keeper pass:", await keeperPass(await chainKeeperDeps(conn, db, keeper)));

step("indexer + side effects");
await settle();
const deps = (signer: Keypair) => ({
  db, signer: signer.publicKey, credentialAuthority: deployer.publicKey, exists: fx.chainExists(conn),
  send: (ix: TransactionInstruction) => send([ix], [signer]),
});
console.log("delivery attestations:", await fx.attestPendingDeliveries(deps(attester)));
console.log("MOCK payouts + NPR attestations:", await fx.mockPartnerPayouts(deps(partner)));
console.log("retention vest payouts:", await fx.mockVestPayouts({ db }));
console.log("attestations again (idempotent):", await fx.attestPendingDeliveries(deps(attester)));

// ── report ──────────────────────────────────────────────────────────
step("REAL NUMBERS");
const q = async (t: string, sel: string, col: string, v: string) => (await db.from(t).select(sel).eq(col, v)).data ?? [];
const [cm] = await q("commitments", "*", "pubkey", commitment.toBase58());
const ms = await q("milestones", "index, amount, status, release_mode, tx_sig", "commitment", commitment.toBase58());
const pays = [
  ...(await db.from("payouts").select("kind, milestone_pubkey, usdc_amount, npr_amount, fx_rate, is_mock").in("milestone_pubkey", [0, 1].map((i) => sdk.pdas.milestone(commitment, i).toBase58()))).data ?? [],
  ...await q("payouts", "kind, milestone_pubkey, usdc_amount, npr_amount, fx_rate, is_mock", "commitment", commitment.toBase58()),
];
const atts = (await db.from("attestations").select("kind, milestone_pubkey, address, tx_sig").in("milestone_pubkey", [0, 1].map((i) => sdk.pdas.milestone(commitment, i).toBase58()))).data ?? [];
const [v] = await q("vaults", "deposited, locked, premiums_earned", "pubkey", vault.toBase58());
const bal = async (owner: PublicKey) => (await conn.getTokenAccountBalance(sdk.ata(owner, mint))).value.amount;
const report = {
  voucher: voucher.publicKey.toBase58(),
  client: client.publicKey.toBase58(),
  specs: SPECS,
  github: { repo: REPO, pr: PR },
  commitment: { address: commitment.toBase58(), status: cm?.status, total_required: usd(cm?.total_required), released: usd(cm?.released), vest_status: cm?.vest_status },
  milestones: ms.map((m: Record<string, unknown>) => ({ ...m, amount: usd(m.amount as string) })),
  voucher_vault: v && { deposited: usd(v.deposited), locked: usd(v.locked), premiums_earned: usd(v.premiums_earned) },
  balances_usdc: { client: usd(await bal(client.publicKey)), voucher_wallet: usd(await bal(voucher.publicKey)) },
  mock_payouts: pays.map((x: Record<string, unknown>) => ({ kind: x.kind, usdc: usd(x.usdc_amount as string), npr: (Number(x.npr_amount) / 100).toLocaleString("en-US"), fx: x.fx_rate, is_mock: x.is_mock })),
  attestations: atts,
  explorer: `https://explorer.solana.com/address/${commitment.toBase58()}?cluster=devnet`,
  m0_release_tx: m0Sig,
};
console.log(JSON.stringify(report, null, 2));
writeFileSync("deployments/devnet-e2e-last.json", JSON.stringify(report, null, 2) + "\n");
process.exit(0);
