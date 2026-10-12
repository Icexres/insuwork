// A real dispute on devnet: commitment → claim (with evidence statement) → admin adds 3 panelists + assigns
// → 2 × Rejected → finalize (salary to partner) → indexer attests it with release_mode 3 (claim rejected).
// Run: node --env-file=apps/web/.env.local scripts/devnet-claim.ts   (local Supabase + sas:setup done)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import * as sdk from "../packages/sdk/src/index.ts";
import * as indexer from "../services/indexer/src/index.ts";
import * as fx from "../services/indexer/src/effects.ts";

const { BN } = anchor;
const key = (n: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`keys/${n}.json`, "utf8"))));
const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const db = createClient((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const deployer = key("deployer");
const mint = key("test-usdc-mint").publicKey;
const partner = key("mock-partner");
const attester = key("attester");
const p = sdk.programs(new anchor.AnchorProvider(conn, new anchor.Wallet(deployer), { commitment: "confirmed" }));
const send = (ixs: TransactionInstruction[], signers: Keypair[]) =>
  sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });
const step = (s: string) => console.log(`\n▶ ${s}`);

step("actors");
const voucher = Keypair.generate(), client = Keypair.generate();
const panel = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
await send([...[[voucher, 0.05], [client, 0.06], ...panel.map((k) => [k, 0.01] as const)].map(([kp, sol]) =>
  SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: (kp as Keypair).publicKey, lamports: (sol as number) * LAMPORTS_PER_SOL }))], [deployer]);
const voucherAta = (await getOrCreateAssociatedTokenAccount(conn, deployer, mint, voucher.publicKey)).address;
const clientAta = (await getOrCreateAssociatedTokenAccount(conn, deployer, mint, client.publicKey)).address;
await mintTo(conn, deployer, mint, voucherAta, deployer, 500_000_000n);
await mintTo(conn, deployer, mint, clientAta, deployer, 1_000_000_000n);

step("bond + commitment (1 × 300 USDC) + activate");
const REF = createHash("sha256").update(`insuwork:v1:claim:${Date.now()}`).digest();
const vault = sdk.pdas.vault(voucher.publicKey), backing = sdk.pdas.backing(vault, REF);
await send([...(await sdk.initVaultAndDepositIxs(p, voucher.publicKey, mint, sdk.usdc(500))), await sdk.createBackingIx(p, voucher.publicKey, REF, sdk.usdc(500))], [voucher]);
const cfg = await p.escrow.account.escrowConfig.fetch(sdk.pdas.escrowConfig());
const SPEC = "Settings page: profile form with validation and avatar upload.";
const { commitment, groups } = await sdk.createCommitmentIxGroups(p, {
  client: client.publicKey, id: 1n, freelancerRef: REF, partner: partner.publicKey, mint, backings: [{ vault, backing }], share: false,
  vestAmount: new BN(0), vestDelaySecs: 0, fundAmount: new BN(sdk.clientDue(300_000_000n, cfg.premiumBps, cfg.platformFeeBps, 0).clientDue.toString()),
  milestones: [{ amount: sdk.usdc(300), dueTs: Math.floor(Date.now() / 1000) + 7 * 86400, specHash: sdk.specHash(SPEC) }],
});
for (const g of groups) await send(g, [client]);
const c = await sdk.loadCommitment(p, commitment);
await send([await sdk.activateMilestoneIx(p, c, 0)], [client]);

step("claim with evidence statement");
const { data: u } = await db.auth.admin.createUser({ email: `claim-client-${Date.now()}@test.local`, password: "e2e-password-1", email_confirm: true });
await db.from("profiles").insert({ id: u.user!.id, role: "client" });
await db.from("wallet_links").insert({ user_id: u.user!.id, wallet: client.publicKey.toBase58() });
const uploader = u.user!.id;
const m0 = sdk.pdas.milestone(commitment, 0).toBase58();
const STATEMENT = "Avatar upload was never delivered and the form has no validation, contrary to the spec.";
await db.from("milestone_specs").upsert({ milestone_pubkey: m0, spec_markdown: SPEC, spec_hash: sdk.specHash(SPEC).toString("hex"),
  uploaded_by: uploader }, { onConflict: "milestone_pubkey" });
await db.from("claim_evidence").insert({ milestone_pubkey: m0, statement: STATEMENT, evidence_hash: sdk.specHash(STATEMENT).toString("hex"),
  uploaded_by: uploader });
await send([await sdk.fileClaimIx(p, c, 0, sdk.specHash(STATEMENT))], [client]);

step("admin: add 3 panelists, assign panel");
await send(await Promise.all(panel.map((k) => sdk.addPanelistIx(p, deployer.publicKey, k.publicKey))), [deployer]);
for (const [i, k] of panel.entries()) await db.from("panelists").upsert({ wallet: k.publicKey.toBase58(), name: `Panelist ${String.fromCharCode(65 + i)}`, active: true });
await send([await sdk.assignPanelIx(p, c, 0, deployer.publicKey, panel.map((k) => k.publicKey))], [deployer]);

step("two Rejected votes, finalize");
for (const k of panel.slice(0, 2)) await send([await sdk.castVoteIx(p, c, 0, k.publicKey, sdk.VOTE.rejected)], [k]);
const fin = await sdk.finalizeClaimIx(p, c, 0);
await send([fin], [deployer]);

step("indexer + attestations");
await new Promise((r) => setTimeout(r, 2000));
for (let i = 0; ; i++) {
  try {
    await indexer.poll(indexer.context(conn, db), conn); // public RPC flakes during a full backfill; poll is idempotent
    break;
  } catch (e) {
    if (i === 4) throw e;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
const deps = (signer: Keypair) => ({ db, signer: signer.publicKey, credentialAuthority: deployer.publicKey, exists: fx.chainExists(conn),
  send: (ix: TransactionInstruction) => send([ix], [signer]) });
console.log("delivery attestations:", await fx.attestPendingDeliveries(deps(attester)));
console.log("MOCK payouts:", await fx.mockPartnerPayouts(deps(partner)));

const claim = sdk.pdas.claim(sdk.pdas.milestone(commitment, 0)).toBase58();
const { data: att } = await db.from("attestations").select("address").eq("milestone_pubkey", m0).eq("kind", "delivery").maybeSingle();
const out = {
  commitment: commitment.toBase58(), claim, client: client.publicKey.toBase58(), spec: SPEC, statement: STATEMENT,
  panel: panel.map((k) => ({ wallet: k.publicKey.toBase58() })), unvoted: panel[2].publicKey.toBase58(), deliveryAttestation: att?.address ?? null,
};
writeFileSync("deployments/devnet-claim-last.json", JSON.stringify(out, null, 2) + "\n");
console.log(out);
process.exit(0);
