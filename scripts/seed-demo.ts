// T-41: demo state just before DEMO-SCRIPT act 1 (idempotent where possible). Personas are illustrative (DEMO-SCRIPT).
//   Sita (freelancer): applied, interviewed (MOCK report), approved, MOCK KYC → visible to vouchers.
//   Rajan (voucher):  vault with 2,500 USDC, not backing anyone yet (act 1 is done live).
//   Northwind (client): wallet with test USDC + SOL.   Three panelists registered on-chain.   Admin = deployer.
// Wallet keys for Phantom import are written to keys/demo/*.json (git-ignored). Sign in with the printed emails
// via magic link (local Mailpit: http://localhost:54324).
// Run: pnpm seed:demo   (local Supabase running, pnpm sas:setup done)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction, type TransactionInstruction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import * as sdk from "../packages/sdk/src/index.ts";
import { newMockKyc } from "../packages/shared/src/mock-partner.ts";

const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const db = createClient((process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const deployer = load("keys/deployer.json");
const mint = load("keys/test-usdc-mint.json").publicKey;
const p = sdk.programs(new anchor.AnchorProvider(conn, new anchor.Wallet(deployer), { commitment: "confirmed" }));
const send = (ixs: TransactionInstruction[], signers: Keypair[]) => sendAndConfirmTransaction(conn, new Transaction().add(...ixs), signers, { commitment: "confirmed" });
const exists = async (k: anchor.web3.PublicKey) => (await conn.getAccountInfo(k)) !== null;

mkdirSync("keys/demo", { recursive: true });
const demoKey = (name: string) => {
  const f = `keys/demo/${name}.json`;
  if (!existsSync(f)) writeFileSync(f, JSON.stringify([...Keypair.generate().secretKey]));
  return load(f);
};
const rajan = demoKey("rajan-voucher"), northwind = demoKey("northwind-client");
const panel = [demoKey("panelist-anil"), demoKey("panelist-maya"), demoKey("panelist-bikram")];

async function user(email: string, role: string, name: string, wallet?: Keypair) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  let u = list?.users.find((x) => x.email === email);
  if (!u) u = (await db.auth.admin.createUser({ email, email_confirm: true })).data.user!;
  await db.from("profiles").upsert({ id: u.id, role, display_name: name });
  if (wallet) {
    await db.from("wallet_links").delete().eq("wallet", wallet.publicKey.toBase58());
    await db.from("wallet_links").upsert({ user_id: u.id, wallet: wallet.publicKey.toBase58() });
  }
  return u.id;
}
async function topUp(kp: Keypair, sol: number, usdc = 0n) {
  if ((await conn.getBalance(kp.publicKey)) < (sol / 2) * LAMPORTS_PER_SOL) {
    await send([SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports: sol * LAMPORTS_PER_SOL })], [deployer]);
  }
  if (usdc) {
    const ata = await getOrCreateAssociatedTokenAccount(conn, deployer, mint, kp.publicKey);
    const have = BigInt((await conn.getTokenAccountBalance(ata.address)).value.amount);
    if (have < usdc * 1_000_000n) await mintTo(conn, deployer, mint, ata.address, deployer, usdc * 1_000_000n - have);
  }
}

console.log("▶ wallets");
await topUp(rajan, 0.1, 3_000n);
await topUp(northwind, 0.15, 5_000n);
for (const k of panel) await topUp(k, 0.02);

console.log("▶ accounts");
const sitaId = await user("sita@demo.insuwork.local", "freelancer", "Sita T.");
await user("rajan@demo.insuwork.local", "voucher", "Rajan Gurung", rajan);
await user("northwind@demo.insuwork.local", "client", "Northwind Labs", northwind);
// hosted: a real ADMIN_EMAILS address (the .local demo inbox only exists in local Mailpit) gets the deployer wallet
const adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim().toLowerCase() || "ops@demo.insuwork.local";
await user(adminEmail, "admin", "InsuWork Ops", deployer);
const panelNames = ["Anil Maharjan", "Maya Shrestha", "Bikram Rai"];
for (const [i, k] of panel.entries()) {
  await user(`panel${i + 1}@demo.insuwork.local`, "panelist", panelNames[i], k);
  if (!(await exists(sdk.pdas.panelist(k.publicKey)))) await send([await sdk.addPanelistIx(p, deployer.publicKey, k.publicKey)], [deployer]);
  await db.from("panelists").upsert({ wallet: k.publicKey.toBase58(), name: panelNames[i], active: true });
}

console.log("▶ Sita: application, report (MOCK), approved, MOCK KYC");
const { data: app, error: appErr } = await db.from("applications").upsert({
  freelancer_user_id: sitaId, full_name: "Sita Tamang", college: "Pulchowk Campus (IOE)", grad_year: 2026, skills: ["React", "TypeScript", "Supabase"],
  portfolio_urls: ["https://example.com/clinic-booking"], github_handle: "sita-demo", status: "ready",
  intro: "Final-year BCT student building product frontends for remote teams.",
}, { onConflict: "freelancer_user_id" }).select("id").single();
if (appErr) throw new Error(`application: ${appErr.message}`);
await db.from("application_baselines").upsert({ freelancer_user_id: sitaId, open_test_or_consultancy: true, noc_filed: false, consultancy_deposit_paid: false });
const report = {
  version: "triage.v1",
  summary: "Builds React/TypeScript frontends; walked through a clinic booking app and a docs migration clearly. Fixed a double-booking bug with a DB constraint and tested it. Limited backend ownership. Available evenings Nepal time; exams in December.",
  stated_skills: ["React", "TypeScript", "Supabase", "Playwright"],
  evidence: [{ claim: "Clinic booking app (~400 weekly users)", source: "portfolio", url: "https://example.com/clinic-booking" }, { claim: "Double-booking fix via unique constraint", source: "interview" }],
  strengths: ["Owns UI end to end", "Tests before shipping", "Clear written English"],
  concerns: ["Little backend experience", "December exam availability"],
  communication: "clear",
  suggested_call_questions: ["How did you test the double-booking fix?", "How would you handle a mid-milestone scope change?", "What would you need from a client in week one?"],
  suitable_starter_tasks: ["UI library audit", "Landing page rebuild"],
  confidence: "medium",
  disclaimer: "Advisory only. Not a credential.",
};
await db.from("triage_reports").delete().eq("application_id", app!.id);
await db.from("triage_reports").insert({ application_id: app!.id, summary: report.summary, report });
const { data: kycRow } = await db.from("partner_kyc").select("freelancer_ref").eq("freelancer_user_id", sitaId).maybeSingle();
let ref = kycRow?.freelancer_ref as string | undefined;
if (!ref) {
  const k = newMockKyc("Nabil Bank", "0012345678");
  await db.from("partner_kyc").insert({ freelancer_user_id: sitaId, kyc_id: k.kycId, salt: `\\x${k.salt.toString("hex")}`, freelancer_ref: k.freelancerRef,
    bank_name: k.bankName, account_masked: k.accountMasked, is_mock: true });
  ref = k.freelancerRef;
}

console.log("▶ Rajan: vault with 2,500 USDC");
if (!(await exists(sdk.pdas.vault(rajan.publicKey)))) {
  await send(await sdk.initVaultAndDepositIxs(p, rajan.publicKey, mint, sdk.usdc(2_500)), [rajan]);
}

const out = {
  note: "Demo personas (illustrative). Sign in by magic link at /login; read the email in Mailpit (http://localhost:54324). Import keys/demo/*.json into a devnet wallet for the wallet roles; the admin uses keys/deployer.json.",
  logins: {
    freelancer: "sita@demo.insuwork.local", voucher: "rajan@demo.insuwork.local", client: "northwind@demo.insuwork.local",
    admin: adminEmail, panel: panel.map((_, i) => `panel${i + 1}@demo.insuwork.local`),
  },
  wallets: { rajan: rajan.publicKey.toBase58(), northwind: northwind.publicKey.toBase58(), panel: panel.map((k) => k.publicKey.toBase58()), admin: deployer.publicKey.toBase58() },
  sita: { freelancerRef: ref, publicProfile: `/p/${ref}` },
};
writeFileSync("deployments/demo-seed.json", JSON.stringify(out, null, 2) + "\n");
console.log(out);
process.exit(0);
