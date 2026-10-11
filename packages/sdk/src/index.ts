// InsuWork SDK: program clients, PDA helpers, remaining-account builders, event decoding and
// address-lookup-table helpers. All on-chain calls from apps/services go through here.
// Erasable TS only (no enums/namespaces) so Node can run it directly with type stripping.
import { sha256 } from "@noble/hashes/sha256";
import { Buffer } from "buffer";
import * as anchor from "@coral-xyz/anchor";
import {
  AddressLookupTableProgram, ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction,
  type AccountMeta, type AddressLookupTableAccount, type TransactionInstruction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { IDL as bondIdl, type InsuworkBond } from "./idl/insuwork_bond.ts";
import { IDL as escrowIdl, type InsuworkEscrow } from "./idl/insuwork_escrow.ts";
import { IDL as disputesIdl, type InsuworkDisputes } from "./idl/insuwork_disputes.ts";

export { bondIdl, escrowIdl, disputesIdl };
export type { InsuworkBond, InsuworkEscrow, InsuworkDisputes };

const { BN } = anchor;
type BNType = InstanceType<typeof BN>;

export const BOND_PROGRAM_ID = new PublicKey(bondIdl.address);
export const ESCROW_PROGRAM_ID = new PublicKey(escrowIdl.address);
export const DISPUTES_PROGRAM_ID = new PublicKey(disputesIdl.address);
export const MAX_BACKINGS = 4;
/** Measured: 4-backing finalize ≈ 231k CU (LiteSVM). Use with buildV0Tx for multi-backing calls. */
export const MULTI_BACKING_COMPUTE_UNITS = 400_000;

// ---------------- PDAs ----------------

const s = (x: string) => Buffer.from(x);
const find = (programId: PublicKey, ...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const u64le = (n: bigint | number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export const pdas = {
  bondConfig: () => find(BOND_PROGRAM_ID, s("bond_config")),
  vault: (voucher: PublicKey) => find(BOND_PROGRAM_ID, s("vault"), voucher.toBuffer()),
  vaultAta: (vault: PublicKey) => find(BOND_PROGRAM_ID, s("vault_ata"), vault.toBuffer()),
  backing: (vault: PublicKey, freelancerRef: Uint8Array) => find(BOND_PROGRAM_ID, s("backing"), vault.toBuffer(), Buffer.from(freelancerRef)),
  escrowConfig: () => find(ESCROW_PROGRAM_ID, s("escrow_config")),
  escrowAuthority: () => find(ESCROW_PROGRAM_ID, s("escrow_authority")),
  partner: (wallet: PublicKey) => find(ESCROW_PROGRAM_ID, s("partner"), wallet.toBuffer()),
  commitment: (client: PublicKey, id: bigint | number) => find(ESCROW_PROGRAM_ID, s("commitment"), client.toBuffer(), u64le(id)),
  escrowAta: (commitment: PublicKey) => find(ESCROW_PROGRAM_ID, s("escrow_ata"), commitment.toBuffer()),
  milestone: (commitment: PublicKey, index: number) => find(ESCROW_PROGRAM_ID, s("milestone"), commitment.toBuffer(), Buffer.from([index])),
  disputesConfig: () => find(DISPUTES_PROGRAM_ID, s("disputes_config")),
  disputesAuthority: () => find(DISPUTES_PROGRAM_ID, s("disputes_authority")),
  panelist: (wallet: PublicKey) => find(DISPUTES_PROGRAM_ID, s("panelist"), wallet.toBuffer()),
  claim: (milestone: PublicKey) => find(DISPUTES_PROGRAM_ID, s("claim"), milestone.toBuffer()),
  claimFee: (claim: PublicKey) => find(DISPUTES_PROGRAM_ID, s("claim_fee"), claim.toBuffer()),
};

// ---------------- clients ----------------

export type Programs = {
  bond: anchor.Program<InsuworkBond>;
  escrow: anchor.Program<InsuworkEscrow>;
  disputes: anchor.Program<InsuworkDisputes>;
};

export function programs(provider: anchor.Provider): Programs {
  return {
    bond: new anchor.Program<InsuworkBond>(bondIdl, provider),
    escrow: new anchor.Program<InsuworkEscrow>(escrowIdl, provider),
    disputes: new anchor.Program<InsuworkDisputes>(disputesIdl, provider),
  };
}

// ---------------- commitment context ----------------

export type BackingRef = { backing: PublicKey; vault: PublicKey; vaultAta: PublicKey; voucher: PublicKey };

/** Everything the multi-account instructions need, resolved once. All token accounts are ATAs of `mint`. */
export type CommitmentCtx = {
  address: PublicKey;
  client: PublicKey;
  partner: PublicKey;
  mint: PublicKey;
  treasury: PublicKey; // escrow treasury (platform fee)
  disputesTreasury: PublicKey; // claim fee destination
  milestoneCount: number;
  backings: BackingRef[];
};

export const ata = (owner: PublicKey, mint: PublicKey) => getAssociatedTokenAddressSync(mint, owner, true);

/** Fetch a commitment and resolve its backings' vaults / vouchers. */
export async function loadCommitment(p: Programs, address: PublicKey): Promise<CommitmentCtx> {
  const c = await p.escrow.account.commitment.fetch(address);
  const cfg = await p.escrow.account.escrowConfig.fetch(pdas.escrowConfig());
  const dcfg = await p.disputes.account.disputesConfig.fetch(pdas.disputesConfig());
  const backings: BackingRef[] = [];
  for (const backing of c.backings.slice(0, c.backingCount)) {
    const b = await p.bond.account.backing.fetch(backing);
    const v = await p.bond.account.bondVault.fetch(b.vault);
    backings.push({ backing, vault: b.vault, vaultAta: pdas.vaultAta(b.vault), voucher: v.voucher });
  }
  return {
    address, client: c.client, partner: c.partner, mint: cfg.usdcMint, treasury: cfg.treasury,
    disputesTreasury: dcfg.treasury, milestoneCount: c.milestoneCount, backings,
  };
}

// ---------------- voucher (bond) ----------------

/** First deposit: create the vault and fund it in one transaction (min_bond applies, E-19). */
export async function initVaultAndDepositIxs(p: Programs, voucher: PublicKey, mint: PublicKey, amount: BNType) {
  const vault = pdas.vault(voucher);
  return [
    await p.bond.methods.initVault().accountsStrict({
      config: pdas.bondConfig(), vault, vaultAta: pdas.vaultAta(vault), usdcMint: mint, voucher,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction(),
    await depositIx(p, voucher, mint, amount),
  ];
}

export function depositIx(p: Programs, voucher: PublicKey, mint: PublicKey, amount: BNType) {
  const vault = pdas.vault(voucher);
  return p.bond.methods.deposit(amount).accountsStrict({
    config: pdas.bondConfig(), vault, vaultAta: pdas.vaultAta(vault), voucherAta: ata(voucher, mint), voucher, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}

/** Only unallocated USDC; the program keeps `deposited - amount >= allocated` (VO-4). */
export function withdrawIx(p: Programs, voucher: PublicKey, mint: PublicKey, amount: BNType) {
  const vault = pdas.vault(voucher);
  return p.bond.methods.withdraw(amount).accountsStrict({
    config: pdas.bondConfig(), vault, vaultAta: pdas.vaultAta(vault), voucherAta: ata(voucher, mint), voucher, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}

export function createBackingIx(p: Programs, voucher: PublicKey, freelancerRef: Uint8Array, cap: BNType) {
  const vault = pdas.vault(voucher);
  return p.bond.methods.createBacking([...freelancerRef], cap).accountsStrict({
    config: pdas.bondConfig(), vault, backing: pdas.backing(vault, freelancerRef), voucher, systemProgram: SystemProgram.programId,
  }).instruction();
}

// ---------------- client (escrow) ----------------

/** spec_hash = sha256(utf8(spec markdown)); the markdown itself stays off-chain (milestone_specs). */
export const specHash = (markdown: string) => Buffer.from(sha256(new TextEncoder().encode(markdown)));

/** Mirrors the program's `Split::new` client_due (integer math): salary + premium + fee − freelancer's share of both. */
export function clientDue(amount: bigint, premiumBps: number, feeBps: number, freelancerShareBps: number) {
  const premium = (amount * BigInt(premiumBps)) / 10_000n;
  const fee = (amount * BigInt(feeBps)) / 10_000n;
  const freelancerPart = (premium * BigInt(freelancerShareBps)) / 10_000n + (fee * BigInt(freelancerShareBps)) / 10_000n;
  return { premium, fee, freelancerPart, clientDue: amount + premium + fee - freelancerPart };
}

export type NewMilestone = { amount: BNType; dueTs: number; specHash: Uint8Array; githubRef?: { repo: string; pr: number } };

/**
 * Instruction groups for a new commitment: [create], then add_milestone in pairs (tx size), then fund.
 * `fundAmount` must equal the commitment's total_required (salary + premium + fee + vest − freelancer share).
 */
export async function createCommitmentIxGroups(p: Programs, o: {
  client: PublicKey; id: bigint; freelancerRef: Uint8Array; partner: PublicKey; mint: PublicKey;
  backings: { vault: PublicKey; backing: PublicKey }[]; share: boolean; vestAmount: BNType; vestDelaySecs: number;
  milestones: NewMilestone[]; fundAmount: BNType;
}) {
  const commitment = pdas.commitment(o.client, o.id);
  const create = await p.escrow.methods.createCommitment(new BN(o.id.toString()), [...o.freelancerRef], o.milestones.length, o.share, o.vestAmount, new BN(o.vestDelaySecs))
    .accountsStrict({
      config: pdas.escrowConfig(), commitment, escrowAta: pdas.escrowAta(commitment), usdcMint: o.mint, partner: pdas.partner(o.partner),
      escrowAuthority: pdas.escrowAuthority(), bondConfig: pdas.bondConfig(), bondProgram: BOND_PROGRAM_ID, client: o.client,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).remainingAccounts(remaining.pairs(o.backings)).instruction();
  const adds = await Promise.all(o.milestones.map((m, i) => p.escrow.methods.addMilestone(i, {
    amount: m.amount, dueTs: new BN(m.dueTs), specHash: [...m.specHash],
    releaseMode: m.githubRef ? { githubOracle: {} } : { clientSig: {} },
    githubRefHash: [...(m.githubRef ? githubRefHash(m.githubRef.repo, m.githubRef.pr) : Buffer.alloc(32))],
  }).accountsStrict({ commitment, milestone: pdas.milestone(commitment, i), client: o.client, systemProgram: SystemProgram.programId }).instruction()));
  const groups: TransactionInstruction[][] = [[create]];
  for (let i = 0; i < adds.length; i += 2) groups.push(adds.slice(i, i + 2));
  groups.push([await fundIx(p, o.client, commitment, o.mint, o.fundAmount)]);
  return { commitment, groups };
}

export function fundIx(p: Programs, client: PublicKey, commitment: PublicKey, mint: PublicKey, amount: BNType) {
  return p.escrow.methods.fund(amount).accountsStrict({
    config: pdas.escrowConfig(), commitment, escrowAta: pdas.escrowAta(commitment), clientAta: ata(client, mint), client, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}

// ---------------- admin ----------------

export const VOTE = { upheld: 1, rejected: 2 } as const;

export function setPausedIx(p: Programs, program: "bond" | "escrow" | "disputes", admin: PublicKey, paused: boolean) {
  const config = program === "bond" ? pdas.bondConfig() : program === "escrow" ? pdas.escrowConfig() : pdas.disputesConfig();
  return p[program].methods.setPaused(paused).accountsStrict({ config, admin }).instruction();
}

/**
 * OQ-6 (E-54): the treasury is any address (wallet, Squads vault, PDA). Also creates its USDC token account
 * (idempotent), because releases and claim fees pay into ata(treasury).
 */
export async function setTreasuryIxs(p: Programs, program: "escrow" | "disputes", admin: PublicKey, treasury: PublicKey, mint: PublicKey) {
  const config = program === "escrow" ? pdas.escrowConfig() : pdas.disputesConfig();
  return [
    createAssociatedTokenAccountIdempotentInstruction(admin, ata(treasury, mint), treasury, mint),
    await p[program].methods.setTreasury(treasury).accountsStrict({ config, admin }).instruction(),
  ];
}

export function setOracleIx(p: Programs, admin: PublicKey, oracle: PublicKey) {
  return p.escrow.methods.setOracle(oracle).accountsStrict({ config: pdas.escrowConfig(), admin }).instruction();
}

export function addPanelistIx(p: Programs, admin: PublicKey, wallet: PublicKey) {
  return p.disputes.methods.addPanelist(wallet).accountsStrict({
    config: pdas.disputesConfig(), panelist: pdas.panelist(wallet), admin, systemProgram: SystemProgram.programId,
  }).instruction();
}

export function setPanelistActiveIx(p: Programs, admin: PublicKey, wallet: PublicKey, active: boolean) {
  return p.disputes.methods.setPanelistActive(active).accountsStrict({ config: pdas.disputesConfig(), panelist: pdas.panelist(wallet), admin }).instruction();
}

// ---------------- remaining accounts ----------------

const w = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: true });

export const remaining = {
  /** create_commitment / activate_milestone: [vault, backing] */
  pairs: (bs: Pick<BackingRef, "vault" | "backing">[]) => bs.flatMap((b) => [w(b.vault), w(b.backing)]),
  /** approve / oracle / crank / resolve: [vault, backing, voucher_ata] */
  release: (bs: BackingRef[], mint: PublicKey) => bs.flatMap((b) => [w(b.vault), w(b.backing), w(ata(b.voucher, mint))]),
  /** cancel / withdraw: [vault, backing, vault_ata] */
  close: (bs: BackingRef[]) => bs.flatMap((b) => [w(b.vault), w(b.backing), w(b.vaultAta)]),
  /** disputes.finalize: [vault, backing, voucher_ata, vault_ata] */
  finalize: (bs: BackingRef[], mint: PublicKey) => bs.flatMap((b) => [w(b.vault), w(b.backing), w(ata(b.voucher, mint)), w(b.vaultAta)]),
};

// ---------------- instruction builders ----------------

const common = () => ({
  escrowAuthority: pdas.escrowAuthority(),
  bondConfig: pdas.bondConfig(),
  bondProgram: BOND_PROGRAM_ID,
  tokenProgram: TOKEN_PROGRAM_ID,
});

export function activateMilestoneIx(p: Programs, c: CommitmentCtx, index: number): Promise<TransactionInstruction> {
  return p.escrow.methods.activateMilestone(index).accountsStrict({
    config: pdas.escrowConfig(), commitment: c.address, milestone: pdas.milestone(c.address, index),
    escrowAuthority: pdas.escrowAuthority(), bondConfig: pdas.bondConfig(), bondProgram: BOND_PROGRAM_ID, client: c.client,
  }).remainingAccounts(remaining.pairs(c.backings)).instruction();
}

function releaseAccounts(c: CommitmentCtx, index: number, authority: PublicKey) {
  return {
    ...common(), config: pdas.escrowConfig(), commitment: c.address, milestone: pdas.milestone(c.address, index),
    escrowAta: pdas.escrowAta(c.address), partner: pdas.partner(c.partner), partnerAta: ata(c.partner, c.mint),
    treasuryAta: ata(c.treasury, c.mint), clientAta: ata(c.client, c.mint), authority,
  };
}

export function approveMilestoneIx(p: Programs, c: CommitmentCtx, index: number) {
  return p.escrow.methods.approveMilestone(index).accountsStrict(releaseAccounts(c, index, c.client))
    .remainingAccounts(remaining.release(c.backings, c.mint)).instruction();
}

/** SPEC-onchain: github_ref_hash = sha256("owner/repo#pr"). Repo names are case-insensitive on GitHub → lowercased. */
export const githubRefHash = (repo: string, pr: number) => Buffer.from(sha256(new TextEncoder().encode(`${repo.toLowerCase()}#${pr}`)));

export function oracleApproveIx(p: Programs, c: CommitmentCtx, index: number, oracle: PublicKey, githubRefHash: Uint8Array) {
  return p.escrow.methods.oracleApprove(index, [...githubRefHash]).accountsStrict(releaseAccounts(c, index, oracle))
    .remainingAccounts(remaining.release(c.backings, c.mint)).instruction();
}

export function crankAutoReleaseIx(p: Programs, c: CommitmentCtx, index: number, cranker: PublicKey) {
  return p.escrow.methods.crankAutoRelease(index).accountsStrict(releaseAccounts(c, index, cranker))
    .remainingAccounts(remaining.release(c.backings, c.mint)).instruction();
}

function closeAccounts(c: CommitmentCtx, authority: PublicKey) {
  return {
    ...common(), config: pdas.escrowConfig(), commitment: c.address, escrowAta: pdas.escrowAta(c.address),
    partnerAta: ata(c.partner, c.mint), clientAta: ata(c.client, c.mint), authority,
  };
}

/** Permissionless once the vest is due (keeper, T-26). */
export function releaseVestIx(p: Programs, c: CommitmentCtx, authority: PublicKey) {
  return p.escrow.methods.releaseVest().accountsStrict({
    commitment: c.address, escrowAta: pdas.escrowAta(c.address), partner: pdas.partner(c.partner),
    partnerAta: ata(c.partner, c.mint), clientAta: ata(c.client, c.mint), authority, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
}
export function cancelCommitmentIx(p: Programs, c: CommitmentCtx) {
  return p.escrow.methods.cancelCommitment().accountsStrict(closeAccounts(c, c.client))
    .remainingAccounts(remaining.close(c.backings)).instruction();
}

export function withdrawCommitmentIx(p: Programs, c: CommitmentCtx) {
  return p.escrow.methods.withdrawCommitment().accountsStrict(closeAccounts(c, c.partner))
    .remainingAccounts(remaining.close(c.backings)).instruction();
}

export function fileClaimIx(p: Programs, c: CommitmentCtx, index: number, evidenceHash: Uint8Array) {
  const milestone = pdas.milestone(c.address, index);
  const claim = pdas.claim(milestone);
  return p.disputes.methods.fileClaim(index, [...evidenceHash]).accountsStrict({
    config: pdas.disputesConfig(), escrowConfig: pdas.escrowConfig(), commitment: c.address, milestone, claim,
    feeVault: pdas.claimFee(claim), usdcMint: c.mint, clientAta: ata(c.client, c.mint),
    disputesAuthority: pdas.disputesAuthority(), escrowProgram: ESCROW_PROGRAM_ID, client: c.client,
    tokenProgram: TOKEN_PROGRAM_ID, systemProgram: anchor.web3.SystemProgram.programId,
  }).instruction();
}

export function assignPanelIx(p: Programs, c: CommitmentCtx, index: number, admin: PublicKey, panel: PublicKey[]) {
  return p.disputes.methods.assignPanel().accountsStrict({
    config: pdas.disputesConfig(), claim: pdas.claim(pdas.milestone(c.address, index)), commitment: c.address, admin,
  }).remainingAccounts([...panel.map((x) => w(pdas.panelist(x))), ...c.backings.map((b) => w(b.vault))]).instruction();
}

export function castVoteIx(p: Programs, c: CommitmentCtx, index: number, panelist: PublicKey, vote: 1 | 2) {
  return p.disputes.methods.castVote(vote, 0).accountsStrict({
    claim: pdas.claim(pdas.milestone(c.address, index)), panelist: pdas.panelist(panelist), wallet: panelist,
  }).instruction();
}

export function finalizeClaimIx(p: Programs, c: CommitmentCtx, index: number) {
  const milestone = pdas.milestone(c.address, index);
  const claim = pdas.claim(milestone);
  const r = releaseAccounts(c, index, pdas.disputesAuthority());
  return p.disputes.methods.finalize().accountsStrict({
    config: pdas.disputesConfig(), claim, feeVault: pdas.claimFee(claim), treasuryAta: ata(c.disputesTreasury, c.mint),
    disputesAuthority: pdas.disputesAuthority(), escrowConfig: r.config, commitment: c.address, milestone,
    escrowAta: r.escrowAta, partner: r.partner, partnerAta: r.partnerAta, escrowTreasuryAta: r.treasuryAta,
    clientAta: r.clientAta, escrowAuthority: r.escrowAuthority, bondConfig: r.bondConfig, bondProgram: BOND_PROGRAM_ID,
    escrowProgram: ESCROW_PROGRAM_ID, tokenProgram: TOKEN_PROGRAM_ID,
  }).remainingAccounts(remaining.finalize(c.backings, c.mint)).instruction();
}

// ---------------- events ----------------

export type DecodedEvent = { program: "bond" | "escrow" | "disputes"; name: string; data: Record<string, unknown> };

/** Decode Anchor events from transaction logs, including those emitted inside CPIs. */
export function decodeEvents(p: Programs, logs: string[]): DecodedEvent[] {
  const out: DecodedEvent[] = [];
  for (const [program, prog] of Object.entries(p) as unknown as [DecodedEvent["program"], anchor.Program<anchor.Idl>][]) {
    const parser = new anchor.EventParser(prog.programId, prog.coder);
    for (const e of parser.parseLogs(logs)) out.push({ program, name: e.name, data: e.data });
  }
  return out;
}

// ---------------- address lookup tables (E-36) ----------------

/**
 * Every address a commitment's multi-backing instructions touch. Put these in one lookup table
 * so finalize / cancel / release with up to 4 backings fit in a v0 transaction.
 */
export function commitmentLookupAddresses(c: CommitmentCtx): PublicKey[] {
  const keys: PublicKey[] = [
    BOND_PROGRAM_ID, ESCROW_PROGRAM_ID, DISPUTES_PROGRAM_ID, TOKEN_PROGRAM_ID,
    pdas.bondConfig(), pdas.escrowConfig(), pdas.disputesConfig(), pdas.escrowAuthority(), pdas.disputesAuthority(),
    c.address, pdas.escrowAta(c.address), pdas.partner(c.partner),
    ata(c.partner, c.mint), ata(c.treasury, c.mint), ata(c.disputesTreasury, c.mint), ata(c.client, c.mint),
  ];
  for (let i = 0; i < c.milestoneCount; i++) {
    const m = pdas.milestone(c.address, i);
    const claim = pdas.claim(m);
    keys.push(m, claim, pdas.claimFee(claim));
  }
  for (const b of c.backings) keys.push(b.vault, b.backing, b.vaultAta, ata(b.voucher, c.mint));
  const seen = new Set<string>();
  return keys.filter((k) => !seen.has(k.toBase58()) && !!seen.add(k.toBase58()));
}

/** Instructions to create a lookup table and fill it (extend in chunks of 20 to stay under tx size). */
export function createLookupTableIxs(authority: PublicKey, payer: PublicKey, recentSlot: number, addresses: PublicKey[]) {
  const [create, lookupTable] = AddressLookupTableProgram.createLookupTable({ authority, payer, recentSlot });
  const extend = [];
  for (let i = 0; i < addresses.length; i += 20) {
    extend.push(AddressLookupTableProgram.extendLookupTable({
      lookupTable, authority, payer, addresses: addresses.slice(i, i + 20),
    }));
  }
  return { lookupTable, create, extend };
}

/**
 * Unsigned v0 transaction using the given lookup tables. Multi-backing finalize / release can
 * exceed the default 200k compute units; pass `computeUnits` to raise the limit.
 */
export function buildV0Tx(
  payer: PublicKey, ixs: TransactionInstruction[], recentBlockhash: string,
  luts: AddressLookupTableAccount[] = [], computeUnits?: number,
) {
  const all = computeUnits ? [ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }), ...ixs] : ixs;
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash, instructions: all }).compileToV0Message(luts);
  return new VersionedTransaction(message);
}

// ---------------- money ----------------

export const usdc = (whole: number | bigint): BNType => new BN((BigInt(whole) * 1_000_000n).toString());
