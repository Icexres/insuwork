// insuwork_disputes — TEST-PLAN §1 D-01..D-06 (T-14) + claim fee (E-32).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  Env, USDC, anchor, Keypair, PublicKey, SystemProgram, TOKEN_PROGRAM_ID, errorName, programsBuilt,
} from "./harness.mjs";

const { BN } = anchor;
const bn = (x) => new BN(x.toString());
const pda = (programId, ...seeds) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const u64le = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const ref = (n) => Buffer.alloc(32, n);
const day = 86400;
const CLAIM_FEE = 10n * USDC;
const UPHELD = 1, REJECTED = 2, PARTIAL = 3;

describe("insuwork_disputes", { skip: !programsBuilt() && "run `anchor build` first" }, () => {
  let env, admin, mint, bond, escrow, disputes;
  let bondConfig, escrowConfig, disputesConfig, escrowAuthority, disputesAuthority;
  let partner, treasury, partnerAta, treasuryAta;
  const panel = []; // 4 panelist keypairs
  let nextId = 1;

  const fetch = (prog, name, addr) => prog.coder.accounts.decode(name, Buffer.from(env.svm.getAccount(addr).data));
  const bal = (a) => env.tokenBalance(a);
  const partnerPda = (w) => pda(escrow.programId, Buffer.from("partner"), w.toBuffer());
  const panelistPda = (w) => pda(disputes.programId, Buffer.from("panelist"), w.toBuffer());
  const milestonePda = (c, i) => pda(escrow.programId, Buffer.from("milestone"), c.toBuffer(), Buffer.from([i]));
  const claimPda = (m) => pda(disputes.programId, Buffer.from("claim"), m.toBuffer());
  const feeVaultPda = (claim) => pda(disputes.programId, Buffer.from("claim_fee"), claim.toBuffer());
  const metas = (keys) => keys.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true }));

  async function addPanelist(wallet) {
    const res = await env.send(disputes.program.methods.addPanelist(wallet)
      .accountsStrict({ config: disputesConfig, panelist: panelistPda(wallet), admin: admin.publicKey, systemProgram: SystemProgram.programId })
      .instruction(), [admin]);
    assert.ok(res.ok, errorName(res));
  }

  async function backedVoucher(r, cap) {
    const kp = env.funded();
    const ata = env.tokenAccount(mint, kp.publicKey, cap);
    const vault = pda(bond.programId, Buffer.from("vault"), kp.publicKey.toBuffer());
    const vaultAta = pda(bond.programId, Buffer.from("vault_ata"), vault.toBuffer());
    const backing = pda(bond.programId, Buffer.from("backing"), vault.toBuffer(), r);
    const p = bond.program.methods;
    const res = await env.send([
      p.initVault().accountsStrict({ config: bondConfig, vault, vaultAta, usdcMint: mint, voucher: kp.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction(),
      p.deposit(bn(cap)).accountsStrict({ config: bondConfig, vault, vaultAta, voucherAta: ata, voucher: kp.publicKey, tokenProgram: TOKEN_PROGRAM_ID }).instruction(),
      p.createBacking([...r], bn(cap)).accountsStrict({ config: bondConfig, vault, backing, voucher: kp.publicKey, systemProgram: SystemProgram.programId }).instruction(),
    ], [kp]);
    assert.ok(res.ok, errorName(res));
    return { kp, vault, vaultAta, backing, premiumAta: env.tokenAccount(mint, kp.publicKey) };
  }

  /** Backed + funded commitment; milestone 0 activated. Client ATA keeps 100 USDC spare for claim fees. */
  async function scenario(amounts = [1_000n * USDC], { dueIn = 30 * day, cap = 1_000n * USDC } = {}) {
    const r = ref(nextId + 100);
    const b = await backedVoucher(r, cap);
    const client = env.funded();
    const id = nextId++;
    const commitment = pda(escrow.programId, Buffer.from("commitment"), client.publicKey.toBuffer(), u64le(id));
    const escrowAta = pda(escrow.programId, Buffer.from("escrow_ata"), commitment.toBuffer());
    const em = escrow.program.methods;
    let res = await env.send(em.createCommitment(bn(id), [...r], amounts.length, false, bn(0), bn(0)).accountsStrict({
      config: escrowConfig, commitment, escrowAta, usdcMint: mint, partner: partnerPda(partner), escrowAuthority, bondConfig,
      bondProgram: bond.programId, client: client.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).remainingAccounts(metas([b.vault, b.backing])).instruction(), [client]);
    assert.ok(res.ok, errorName(res));
    const due = env.svm.getClock().unixTimestamp + BigInt(dueIn);
    for (const [i, a] of amounts.entries()) {
      res = await env.send(em.addMilestone(i, { amount: bn(a), dueTs: bn(due), specHash: [...ref(9)], releaseMode: { clientSig: {} }, githubRefHash: [...ref(0)] })
        .accountsStrict({ commitment, milestone: milestonePda(commitment, i), client: client.publicKey, systemProgram: SystemProgram.programId }).instruction(), [client]);
      assert.ok(res.ok, errorName(res));
    }
    const total = BigInt(fetch(escrow.program, "commitment", commitment).totalRequired.toString());
    const clientAta = env.tokenAccount(mint, client.publicKey, total + 100n * USDC);
    res = await env.send(em.fund(bn(total)).accountsStrict({ config: escrowConfig, commitment, escrowAta, clientAta, client: client.publicKey, tokenProgram: TOKEN_PROGRAM_ID }).instruction(), [client]);
    assert.ok(res.ok, errorName(res));
    const c = { client, clientAta, commitment, escrowAta, b };
    assert.ok((await activate(c, 0)).ok);
    return c;
  }

  const activate = (c, i) => env.send(escrow.program.methods.activateMilestone(i).accountsStrict({
    config: escrowConfig, commitment: c.commitment, milestone: milestonePda(c.commitment, i), escrowAuthority, bondConfig,
    bondProgram: bond.programId, client: c.client.publicKey,
  }).remainingAccounts(metas([c.b.vault, c.b.backing])).instruction(), [c.client]);

  const releaseAccts = (c, i, authority) => ({
    config: escrowConfig, commitment: c.commitment, milestone: milestonePda(c.commitment, i), escrowAta: c.escrowAta,
    partner: partnerPda(partner), partnerAta, treasuryAta, clientAta: c.clientAta, escrowAuthority, bondConfig,
    bondProgram: bond.programId, authority, tokenProgram: TOKEN_PROGRAM_ID,
  });
  const approve = (c, i) => env.send(escrow.program.methods.approveMilestone(i).accountsStrict(releaseAccts(c, i, c.client.publicKey))
    .remainingAccounts(metas([c.b.vault, c.b.backing, c.b.premiumAta])).instruction(), [c.client]);

  function fileClaim(c, i, signer = c.client, clientAta = c.clientAta) {
    const m = milestonePda(c.commitment, i);
    const claim = claimPda(m);
    const res = env.send(disputes.program.methods.fileClaim(i, [...ref(42)]).accountsStrict({
      config: disputesConfig, escrowConfig, commitment: c.commitment, milestone: m, claim, feeVault: feeVaultPda(claim),
      usdcMint: mint, clientAta, disputesAuthority, escrowProgram: escrow.programId, client: signer.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction(), [signer]);
    return { claim, res };
  }

  const assignPanel = (c, claim, wallets) => env.send(disputes.program.methods.assignPanel()
    .accountsStrict({ config: disputesConfig, claim, commitment: c.commitment, admin: admin.publicKey })
    .remainingAccounts(metas([...wallets.map(panelistPda), c.b.vault])).instruction(), [admin]);

  const vote = (kp, claim, v, bps = 0) => env.send(disputes.program.methods.castVote(v, bps)
    .accountsStrict({ claim, panelist: panelistPda(kp.publicKey), wallet: kp.publicKey }).instruction(), [kp]);

  const finalize = (c, claim, i) => env.send(disputes.program.methods.finalize().accountsStrict({
    config: disputesConfig, claim, feeVault: feeVaultPda(claim), treasuryAta, disputesAuthority, escrowConfig,
    commitment: c.commitment, milestone: milestonePda(c.commitment, i), escrowAta: c.escrowAta, partner: partnerPda(partner),
    partnerAta, escrowTreasuryAta: treasuryAta, clientAta: c.clientAta, escrowAuthority, bondConfig, bondProgram: bond.programId,
    escrowProgram: escrow.programId, tokenProgram: TOKEN_PROGRAM_ID,
  }).remainingAccounts(metas([c.b.vault, c.b.backing, c.b.premiumAta, c.b.vaultAta])).instruction(), [env.funded()]);

  const panelOf = () => panel.slice(0, 3).map((k) => k.publicKey);

  before(async () => {
    env = new Env();
    admin = env.funded();
    bond = env.deployUpgradeable("insuwork_bond", admin.publicKey);
    escrow = env.deployUpgradeable("insuwork_escrow", admin.publicKey);
    disputes = env.deployUpgradeable("insuwork_disputes", admin.publicKey);
    mint = env.createMint();
    bondConfig = pda(bond.programId, Buffer.from("bond_config"));
    escrowConfig = pda(escrow.programId, Buffer.from("escrow_config"));
    disputesConfig = pda(disputes.programId, Buffer.from("disputes_config"));
    escrowAuthority = pda(escrow.programId, Buffer.from("escrow_authority"));
    disputesAuthority = pda(disputes.programId, Buffer.from("disputes_authority"));
    partner = Keypair.generate().publicKey;
    treasury = Keypair.generate().publicKey;
    partnerAta = env.tokenAccount(mint, partner);
    treasuryAta = env.tokenAccount(mint, treasury);

    const init = (prog, config, params) => prog.program.methods.initConfig(params).accountsStrict({
      config, usdcMint: mint, admin: admin.publicKey, program: prog.programId, programData: prog.programData, systemProgram: SystemProgram.programId,
    }).instruction();
    const res = await env.send([
      init(bond, bondConfig, { escrowProgram: escrow.programId, disputesProgram: disputes.programId, minBond: bn(500n * USDC) }),
      init(escrow, escrowConfig, {
        bondProgram: bond.programId, disputesProgram: disputes.programId, treasury, githubOracle: Keypair.generate().publicKey,
        submitter: Keypair.generate().publicKey, premiumBps: 300, platformFeeBps: 100, freelancerShareBps: 5000, claimWindowSecs: bn(14 * day), cancelFeeBps: 500, withdrawPenaltyBps: 1000,
      }),
      init(disputes, disputesConfig, { escrowProgram: escrow.programId, bondProgram: bond.programId, treasury, rulingSecs: bn(7 * day), claimFee: bn(CLAIM_FEE) }),
      escrow.program.methods.registerPartner(partner, [...Buffer.alloc(32, 0x4d)], true)
        .accountsStrict({ config: escrowConfig, partner: partnerPda(partner), admin: admin.publicKey, systemProgram: SystemProgram.programId }).instruction(),
    ], [admin]);
    assert.ok(res.ok, errorName(res));
    for (let i = 0; i < 4; i++) {
      panel.push(env.funded());
      await addPanelist(panel[i].publicKey);
    }
  });

  it("D-01 file_claim by a non-client fails NotClient", async () => {
    const c = await scenario();
    const stranger = env.funded();
    const { res } = fileClaim(c, 0, stranger, env.tokenAccount(mint, stranger.publicKey, 100n * USDC));
    assert.equal(errorName(await res), "NotClient");
  });

  it("D-02 claim allowed with nothing delivered until due + 14d; after that WindowClosed", async () => {
    const c = await scenario([1_000n * USDC], { dueIn: 1 * day });
    env.warp(16 * day);
    assert.equal(errorName(await fileClaim(c, 0).res), "WindowClosed");

    const d = await scenario([1_000n * USDC], { dueIn: 1 * day });
    env.warp(14 * day); // no submission; still inside due + 14d
    const { claim, res } = fileClaim(d, 0);
    assert.ok((await res).ok);
    assert.equal(bal(feeVaultPda(claim)), CLAIM_FEE);
    assert.deepEqual(fetch(escrow.program, "milestone", milestonePda(d.commitment, 0)).status, { disputed: {} });
  });

  it("E-09 (real path) a frozen milestone can't be approved", async () => {
    const c = await scenario();
    assert.ok((await fileClaim(c, 0).res).ok);
    assert.equal(errorName(await approve(c, 0)), "NotActive");
  });

  it("D-03 assign_panel rejects inactive, duplicate, client or voucher panelists", async () => {
    const c = await scenario();
    const { claim, res } = fileClaim(c, 0);
    assert.ok((await res).ok);
    const [p1, p2, p3] = panelOf();

    assert.equal(errorName(await assignPanel(c, claim, [p1, p1, p2])), "InvalidPanel");
    await addPanelist(c.client.publicKey);
    assert.equal(errorName(await assignPanel(c, claim, [p1, p2, c.client.publicKey])), "InvalidPanel");
    await addPanelist(c.b.kp.publicKey);
    assert.equal(errorName(await assignPanel(c, claim, [p1, p2, c.b.kp.publicKey])), "InvalidPanel");
    const off = env.funded();
    await addPanelist(off.publicKey);
    await env.send(disputes.program.methods.setPanelistActive(false)
      .accountsStrict({ config: disputesConfig, panelist: panelistPda(off.publicKey), admin: admin.publicKey }).instruction(), [admin]);
    assert.equal(errorName(await assignPanel(c, claim, [p1, p2, off.publicKey])), "InvalidPanel");
    assert.ok((await assignPanel(c, claim, [p1, p2, p3])).ok);
  });

  it("D-04 non-panelist, double vote, late vote and partial vote (OQ-3) fail", async () => {
    const c = await scenario();
    const { claim, res: filed } = fileClaim(c, 0);
    assert.ok((await filed).ok);
    assert.ok((await assignPanel(c, claim, panelOf())).ok);
    assert.equal(errorName(await vote(panel[3], claim, UPHELD)), "NotPanelist");
    assert.equal(errorName(await vote(panel[0], claim, PARTIAL, 5000)), "VoteNotSupported");
    assert.ok((await vote(panel[0], claim, UPHELD)).ok);
    assert.equal(errorName(await vote(panel[0], claim, REJECTED)), "AlreadyVoted");
    assert.ok((await vote(panel[1], claim, REJECTED)).ok);
    assert.equal(errorName(await finalize(c, claim, 0)), "NoMajority");
    env.warp(8 * day);
    assert.equal(errorName(await vote(panel[2], claim, UPHELD)), "DeadlinePassed");
  });

  it("D-07 no majority by the ruling deadline defaults to Rejected (E-33)", async () => {
    const c = await scenario();
    const p0 = bal(partnerAta);
    const t0 = bal(treasuryAta);
    const { claim, res: filed } = fileClaim(c, 0);
    assert.ok((await filed).ok);
    assert.ok((await assignPanel(c, claim, panelOf())).ok);
    assert.ok((await vote(panel[0], claim, UPHELD)).ok); // only one vote cast
    assert.equal(errorName(await finalize(c, claim, 0)), "NoMajority");
    env.warp(7 * day + 1);
    const res = await finalize(c, claim, 0);
    assert.ok(res.ok, errorName(res));
    assert.deepEqual(fetch(disputes.program, "claim", claim).outcome, { rejected: {} });
    assert.equal(bal(partnerAta) - p0, 1_000n * USDC);
    assert.equal(bal(treasuryAta) - t0, 10n * USDC + CLAIM_FEE);
  });

  it("D-07 a majority reached before the deadline still wins after it", async () => {
    const c = await scenario();
    const { claim, res: filed } = fileClaim(c, 0);
    assert.ok((await filed).ok);
    assert.ok((await assignPanel(c, claim, panelOf())).ok);
    assert.ok((await vote(panel[0], claim, UPHELD)).ok);
    assert.ok((await vote(panel[1], claim, UPHELD)).ok);
    env.warp(30 * day);
    assert.ok((await finalize(c, claim, 0)).ok);
    assert.deepEqual(fetch(disputes.program, "claim", claim).outcome, { upheld: {} });
  });

  it("D-05 worked example: 3 released, milestone 4 upheld → bond pays 1,000, voucher net −910", async () => {
    const c = await scenario(Array(6).fill(1_000n * USDC));
    for (let i = 0; i < 3; i++) {
      if (i > 0) assert.ok((await activate(c, i)).ok);
      assert.ok((await approve(c, i)).ok);
    }
    assert.ok((await activate(c, 3)).ok);
    const clientBefore = bal(c.clientAta);
    const treasuryBefore = bal(treasuryAta);
    const { claim, res: filed } = fileClaim(c, 3);
    assert.ok((await filed).ok);
    assert.ok((await assignPanel(c, claim, panelOf())).ok);
    assert.ok((await vote(panel[0], claim, UPHELD)).ok);
    assert.ok((await vote(panel[1], claim, UPHELD)).ok);
    const res = await finalize(c, claim, 3);
    assert.ok(res.ok, errorName(res));

    // client: bond 1,000 + salary 1,000 + premium 30 back; claim fee refunded; treasury keeps the 10 fee
    assert.equal(bal(c.clientAta) - clientBefore, 2_030n * USDC);
    assert.equal(bal(treasuryAta) - treasuryBefore, 10n * USDC);
    const v = fetch(bond.program, "bondVault", c.b.vault);
    assert.equal(v.deposited.toString(), "0");
    assert.equal(v.claimsPaid.toString(), (1_000n * USDC).toString());
    assert.equal(BigInt(v.premiumsEarned.toString()) - BigInt(v.claimsPaid.toString()), -910n * USDC);
    const cl = fetch(disputes.program, "claim", claim);
    assert.deepEqual(cl.outcome, { upheld: {} });
    assert.equal(cl.payout.toString(), (1_000n * USDC).toString());
    assert.deepEqual(fetch(escrow.program, "milestone", milestonePda(c.commitment, 3)).status, { resolved: {} });
    // bond is spent: the next milestone has no cover
    assert.equal(errorName(await activate(c, 4)), "BackingInsufficient");
  });

  it("D-06 2 Rejected → milestone released normally (MilestoneReleased), treasury keeps the claim fee", async () => {
    const c = await scenario();
    const p0 = bal(partnerAta);
    const t0 = bal(treasuryAta);
    const { claim, res: filed } = fileClaim(c, 0);
    assert.ok((await filed).ok);
    assert.ok((await assignPanel(c, claim, panelOf())).ok);
    assert.ok((await vote(panel[1], claim, REJECTED)).ok);
    assert.ok((await vote(panel[2], claim, REJECTED)).ok);
    const res = await finalize(c, claim, 0);
    assert.ok(res.ok, errorName(res));
    assert.equal(bal(partnerAta) - p0, 1_000n * USDC);
    assert.equal(bal(c.b.premiumAta), 30n * USDC);
    assert.equal(bal(treasuryAta) - t0, 10n * USDC + CLAIM_FEE); // platform fee + claim fee
    const released = res.logs.filter((l) => l.startsWith("Program data: "))
      .map((l) => escrow.program.coder.events.decode(l.slice(14))).find((e) => e?.name === "milestoneReleased");
    assert.ok(released, "MilestoneReleased emitted (attestation trigger)");
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).status, { completed: {} });
    assert.equal(errorName(await finalize(c, claim, 0)), "InvalidStatus");
  });
});
