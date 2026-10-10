// T-18: one-time devnet setup after `pnpm deploy:devnet`. Idempotent (skips what exists).
// Creates the demo test mint (E-24), initialises the three configs (signer must still be the
// upgrade authority), registers the MOCK partner, and writes public addresses to deployments/devnet.json.
// Run on the host: node scripts/devnet-init.mjs   (RPC: SOLANA_RPC_URL, default devnet)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as sdk from "../packages/sdk/src/index.ts";

const { BN } = anchor;
const day = 86400;
const key = (name) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`keys/${name}.json`, "utf8"))));
const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const programData = (id) => PublicKey.findProgramAddressSync([id.toBuffer()], UPGRADEABLE_LOADER)[0];

const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const deployer = key("deployer");
const partner = key("mock-partner").publicKey;
const treasury = key("treasury").publicKey;
const oracle = key("github-oracle").publicKey;
const submitter = key("submitter").publicKey;
const p = sdk.programs(new anchor.AnchorProvider(connection, new anchor.Wallet(deployer), { commitment: "confirmed" }));
const exists = async (addr) => (await connection.getAccountInfo(addr)) !== null;

// E-24: project test mint (6 decimals); swap to Circle USDC = new deployment with a different mint.
let mint;
if (existsSync("keys/test-usdc-mint.json")) {
  mint = key("test-usdc-mint").publicKey;
} else {
  const mintKp = Keypair.generate();
  mint = await createMint(connection, deployer, deployer.publicKey, null, 6, mintKp);
  writeFileSync("keys/test-usdc-mint.json", JSON.stringify([...mintKp.secretKey]));
}
console.log("test USDC mint:", mint.toBase58());

const init = (prog, id, config, params) => prog.methods.initConfig(params).accountsStrict({
  config, usdcMint: mint, admin: deployer.publicKey, program: id, programData: programData(id), systemProgram: SystemProgram.programId,
}).rpc();

if (!(await exists(sdk.pdas.bondConfig()))) {
  console.log("bond init_config", await init(p.bond, sdk.BOND_PROGRAM_ID, sdk.pdas.bondConfig(), {
    escrowProgram: sdk.ESCROW_PROGRAM_ID, disputesProgram: sdk.DISPUTES_PROGRAM_ID, minBond: sdk.usdc(500),
  }));
}
if (!(await exists(sdk.pdas.escrowConfig()))) {
  console.log("escrow init_config", await init(p.escrow, sdk.ESCROW_PROGRAM_ID, sdk.pdas.escrowConfig(), {
    bondProgram: sdk.BOND_PROGRAM_ID, disputesProgram: sdk.DISPUTES_PROGRAM_ID, treasury, githubOracle: oracle, submitter,
    premiumBps: 300, platformFeeBps: 100, freelancerShareBps: 5000, claimWindowSecs: new BN(14 * day),
    cancelFeeBps: 500, withdrawPenaltyBps: 1000,
  }));
}
if (!(await exists(sdk.pdas.disputesConfig()))) {
  console.log("disputes init_config", await init(p.disputes, sdk.DISPUTES_PROGRAM_ID, sdk.pdas.disputesConfig(), {
    escrowProgram: sdk.ESCROW_PROGRAM_ID, bondProgram: sdk.BOND_PROGRAM_ID, treasury, rulingSecs: new BN(7 * day), claimFee: sdk.usdc(10),
  }));
}
if (!(await exists(sdk.pdas.partner(partner)))) {
  const name = Buffer.alloc(32);
  name.write("MOCK Conversion Partner");
  console.log("register MOCK partner", await p.escrow.methods.registerPartner(partner, [...name], true).accountsStrict({
    config: sdk.pdas.escrowConfig(), partner: sdk.pdas.partner(partner), admin: deployer.publicKey, systemProgram: SystemProgram.programId,
  }).rpc());
}
// token accounts the release paths pay into
for (const owner of [partner, treasury]) await getOrCreateAssociatedTokenAccount(connection, deployer, mint, owner);

const out = {
  cluster: "devnet",
  programs: { bond: sdk.BOND_PROGRAM_ID, escrow: sdk.ESCROW_PROGRAM_ID, disputes: sdk.DISPUTES_PROGRAM_ID },
  configs: { bond: sdk.pdas.bondConfig(), escrow: sdk.pdas.escrowConfig(), disputes: sdk.pdas.disputesConfig() },
  usdcMint: mint, usdcMintIsTest: true,
  admin: deployer.publicKey, treasury, githubOracle: oracle, submitter,
  mockPartner: { wallet: partner, record: sdk.pdas.partner(partner), isMock: true },
};
mkdirSync("deployments", { recursive: true });
writeFileSync("deployments/devnet.json", JSON.stringify(out, (_, v) => (v instanceof PublicKey ? v.toBase58() : v), 2) + "\n");
console.log("wrote deployments/devnet.json");
