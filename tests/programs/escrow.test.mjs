// insuwork_escrow — TEST-PLAN §1 E-01..E-03 (T-11) + E-20/E-25/E-28/E-29 decisions.
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

describe("insuwork_escrow", { skip: !programsBuilt() && "run `anchor build` first" }, () => {
  let env, admin, mint, bond, escrow, bondConfig, escrowConfig, escrowAuthority, partner, treasury;
  let partnerKp, oracle, backend;
  let nextId = 1;

  const fetch = (prog, name, addr) => prog.coder.accounts.decode(name, Buffer.from(env.svm.getAccount(addr).data));
  const partnerPda = (w) => pda(escrow.programId, Buffer.from("partner"), w.toBuffer());

  // A voucher with a funded vault and a backing on `r`.
  async function backedVoucher(r, cap, deposit = cap) {
    const kp = env.funded();
    const ata = env.tokenAccount(mint, kp.publicKey, deposit);
    const vault = pda(bond.programId, Buffer.from("vault"), kp.publicKey.toBuffer());
    const vaultAta = pda(bond.programId, Buffer.from("vault_ata"), vault.toBuffer());
    const backing = pda(bond.programId, Buffer.from("backing"), vault.toBuffer(), r);
    const p = bond.program.methods;
    const res = await env.send([
      p.initVault().accountsStrict({ config: bondConfig, vault, vaultAta, usdcMint: mint, voucher: kp.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).instruction(),
      p.deposit(bn(deposit)).accountsStrict({ config: bondConfig, vault, vaultAta, voucherAta: ata, voucher: kp.publicKey, tokenProgram: TOKEN_PROGRAM_ID }).instruction(),
      p.createBacking([...r], bn(cap)).accountsStrict({ config: bondConfig, vault, backing, voucher: kp.publicKey, systemProgram: SystemProgram.programId }).instruction(),
    ], [kp]);
    assert.ok(res.ok, errorName(res));
    return { kp, vault, backing };
  }

  function createCommitment(client, r, backers, { milestones = 1, share = false, partnerWallet = partner, vest = 0n, vestDelay = 0 } = {}) {
    const id = nextId++;
    const commitment = pda(escrow.programId, Buffer.from("commitment"), client.publicKey.toBuffer(), u64le(id));
    const escrowAta = pda(escrow.programId, Buffer.from("escrow_ata"), commitment.toBuffer());
    const ix = escrow.program.methods.createCommitment(bn(id), [...r], milestones, share, bn(vest), bn(vestDelay))
      .accountsStrict({
        config: escrowConfig, commitment, escrowAta, usdcMint: mint, partner: partnerPda(partnerWallet),
        escrowAuthority, bondConfig, bondProgram: bond.programId, client: client.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(backers.flatMap((b) => [
        { pubkey: b.vault, isSigner: false, isWritable: true },
        { pubkey: b.backing, isSigner: false, isWritable: true },
      ]))
      .instruction();
    return { commitment, escrowAta, res: env.send(ix, [client]) };
  }

  const addMilestone = (client, commitment, index, amount, dueIn = 30 * 86400, oracleRef = null) => {
    const due = env.svm.getClock().unixTimestamp + BigInt(dueIn);
    return env.send(escrow.program.methods.addMilestone(index, {
      amount: bn(amount), dueTs: bn(due), specHash: [...ref(9)],
      releaseMode: oracleRef ? { githubOracle: {} } : { clientSig: {} }, githubRefHash: [...(oracleRef ?? ref(0))],
    }).accountsStrict({
      commitment, milestone: pda(escrow.programId, Buffer.from("milestone"), commitment.toBuffer(), Buffer.from([index])),
      client: client.publicKey, systemProgram: SystemProgram.programId,
    }).instruction(), [client]);
  };

  const fund = (client, c, clientAta, amount) => env.send(escrow.program.methods.fund(bn(amount)).accountsStrict({
    config: escrowConfig, commitment: c.commitment, escrowAta: c.escrowAta, clientAta, client: client.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction(), [client]);

  before(async () => {
    env = new Env();
    admin = env.funded();
    bond = env.deployUpgradeable("insuwork_bond", admin.publicKey);
    escrow = env.deployUpgradeable("insuwork_escrow", admin.publicKey);
    mint = env.createMint();
    bondConfig = pda(bond.programId, Buffer.from("bond_config"));
    escrowConfig = pda(escrow.programId, Buffer.from("escrow_config"));
    escrowAuthority = pda(escrow.programId, Buffer.from("escrow_authority"));
    partnerKp = env.funded();
    partner = partnerKp.publicKey;
    oracle = env.funded();
    backend = env.funded();
    treasury = Keypair.generate().publicKey;
    const disputesProgram = Keypair.generate().publicKey;

    const res = await env.send([
      bond.program.methods.initConfig({ escrowProgram: escrow.programId, disputesProgram, minBond: bn(500n * USDC) })
        .accountsStrict({ config: bondConfig, usdcMint: mint, admin: admin.publicKey, program: bond.programId, programData: bond.programData, systemProgram: SystemProgram.programId }).instruction(),
      escrow.program.methods.initConfig({
        bondProgram: bond.programId, disputesProgram, treasury, githubOracle: oracle.publicKey, submitter: backend.publicKey,
        premiumBps: 300, platformFeeBps: 100, freelancerShareBps: 5000, claimWindowSecs: bn(14 * 86400), cancelFeeBps: 500, withdrawPenaltyBps: 1000,
      }).accountsStrict({ config: escrowConfig, usdcMint: mint, admin: admin.publicKey, program: escrow.programId, programData: escrow.programData, systemProgram: SystemProgram.programId }).instruction(),
      escrow.program.methods.registerPartner(partner, [...Buffer.alloc(32, 0x4d)], true)
        .accountsStrict({ config: escrowConfig, partner: partnerPda(partner), admin: admin.publicKey, systemProgram: SystemProgram.programId }).instruction(),
    ], [admin]);
    assert.ok(res.ok, errorName(res));
  });

  it("register_partner by non-admin fails Unauthorized", async () => {
    const x = env.funded();
    const w = Keypair.generate().publicKey;
    const res = await env.send(escrow.program.methods.registerPartner(w, [...ref(1)], true)
      .accountsStrict({ config: escrowConfig, partner: partnerPda(w), admin: x.publicKey, systemProgram: SystemProgram.programId }).instruction(), [x]);
    assert.equal(errorName(res), "Unauthorized");
  });

  it("E-01 create_commitment with inactive partner fails InactivePartner", async () => {
    const w = Keypair.generate().publicKey;
    await env.send([
      escrow.program.methods.registerPartner(w, [...ref(2)], true).accountsStrict({ config: escrowConfig, partner: partnerPda(w), admin: admin.publicKey, systemProgram: SystemProgram.programId }).instruction(),
      escrow.program.methods.setPartnerActive(false).accountsStrict({ config: escrowConfig, partner: partnerPda(w), admin: admin.publicKey }).instruction(),
    ], [admin]);
    const r = ref(10);
    const b = await backedVoucher(r, 1_000n * USDC);
    const { res } = createCommitment(env.funded(), r, [b], { partnerWallet: w });
    assert.equal(errorName(await res), "InactivePartner");
  });

  it("E-02 backing / freelancer_ref mismatch fails BackingMismatch", async () => {
    const b = await backedVoucher(ref(11), 1_000n * USDC);
    const { res } = createCommitment(env.funded(), ref(12), [b]);
    assert.equal(errorName(await res), "BackingMismatch");
  });

  it("E-25 voucher cannot be the client on the same commitment", async () => {
    const r = ref(13);
    const b = await backedVoucher(r, 1_000n * USDC);
    const { res } = createCommitment(b.kp, r, [b]);
    assert.equal(errorName(await res), "VoucherIsClient");
  });

  it("E-29 multiple backings attach; E-20 attached backing can't be closed", async () => {
    const r = ref(14);
    const b1 = await backedVoucher(r, 1_000n * USDC);
    const b2 = await backedVoucher(r, 600n * USDC);
    const c = createCommitment(env.funded(), r, [b1, b2]);
    const res = await c.res;
    assert.ok(res.ok, errorName(res));
    const cm = fetch(escrow.program, "commitment", c.commitment);
    assert.equal(cm.backingCount, 2);
    assert.deepEqual([cm.backings[0].toBase58(), cm.backings[1].toBase58()], [b1.backing.toBase58(), b2.backing.toBase58()]);
    assert.equal(fetch(bond.program, "backing", b1.backing).activeCommitments, 1);
    assert.equal(fetch(bond.program, "backing", b2.backing).activeCommitments, 1);

    const close = await env.send(bond.program.methods.closeBacking()
      .accountsStrict({ vault: b1.vault, backing: b1.backing, voucher: b1.kp.publicKey }).instruction(), [b1.kp]);
    assert.equal(errorName(close), "BackingInUse");
  });

  it("duplicate backing in one commitment fails InvalidBackings", async () => {
    const r = ref(15);
    const b = await backedVoucher(r, 1_000n * USDC);
    const { res } = createCommitment(env.funded(), r, [b, b]);
    assert.equal(errorName(await res), "InvalidBackings");
  });

  it("E-03 fund exact total → Funded; overfund fails; funding before all milestones fails", async () => {
    const r = ref(16);
    const b = await backedVoucher(r, 1_000n * USDC);
    const client = env.funded();
    const c = createCommitment(client, r, [b], { milestones: 2 });
    assert.ok((await c.res).ok);
    const clientAta = env.tokenAccount(mint, client.publicKey, 10_000n * USDC);

    assert.ok((await addMilestone(client, c.commitment, 0, 1_000n * USDC)).ok);
    assert.equal(errorName(await fund(client, c, clientAta, 1n)), "MilestonesIncomplete");
    assert.equal(errorName(await addMilestone(client, c.commitment, 2, 1_000n * USDC)), "InvalidMilestoneIndex");
    assert.equal(errorName(await addMilestone(client, c.commitment, 1, 0n)), "ZeroAmount");
    assert.equal(errorName(await addMilestone(client, c.commitment, 1, USDC, -1)), "InvalidDueDate");
    assert.ok((await addMilestone(client, c.commitment, 1, 1_000n * USDC)).ok);

    const total = 2n * 1_040n * USDC; // no sharing: amount + 3% premium + 1% fee per milestone
    assert.equal(fetch(escrow.program, "commitment", c.commitment).totalRequired.toString(), total.toString());
    assert.equal(errorName(await fund(client, c, clientAta, total + 1n)), "Overfund");
    assert.ok((await fund(client, c, clientAta, 1_000n * USDC)).ok); // partial funding allowed
    assert.ok((await fund(client, c, clientAta, total - 1_000n * USDC)).ok);
    const cm = fetch(escrow.program, "commitment", c.commitment);
    assert.deepEqual(cm.status, { funded: {} });
    assert.equal(env.tokenBalance(c.escrowAta), total);
    assert.equal(errorName(await fund(client, c, clientAta, 1n)), "InvalidStatus");
  });

  it("E-28 sharing on: client funds amount + half of premium and fee", async () => {
    const r = ref(17);
    const b = await backedVoucher(r, 1_000n * USDC);
    const client = env.funded();
    const c = createCommitment(client, r, [b], { share: true });
    assert.ok((await c.res).ok);
    assert.equal(fetch(escrow.program, "commitment", c.commitment).freelancerShareBps, 5000);
    assert.ok((await addMilestone(client, c.commitment, 0, 1_000n * USDC)).ok);
    // 1000 + (30 + 10) - (15 + 5) = 1020
    assert.equal(fetch(escrow.program, "commitment", c.commitment).totalRequired.toString(), (1_020n * USDC).toString());
  });

  const milestonePda = (commitment, i) => pda(escrow.programId, Buffer.from("milestone"), commitment.toBuffer(), Buffer.from([i]));
  const activate = (client, commitment, index, backers) => env.send(escrow.program.methods.activateMilestone(index)
    .accountsStrict({
      config: escrowConfig, commitment, milestone: milestonePda(commitment, index), escrowAuthority, bondConfig,
      bondProgram: bond.programId, client: client.publicKey,
    })
    .remainingAccounts(backers.flatMap((b) => [
      { pubkey: b.vault, isSigner: false, isWritable: true },
      { pubkey: b.backing, isSigner: false, isWritable: true },
    ]))
    .instruction(), [client]);

  // Funded commitment over `backers` with the given milestone amounts.
  async function fundedCommitment(r, backers, amounts, { share = false, dueIn = 30 * 86400, oracleRef = null, vest = 0n, vestDelay = 0 } = {}) {
    const client = env.funded();
    const c = createCommitment(client, r, backers, { milestones: amounts.length, share, vest, vestDelay });
    assert.ok((await c.res).ok);
    for (const [i, a] of amounts.entries()) assert.ok((await addMilestone(client, c.commitment, i, a, dueIn, oracleRef)).ok);
    const total = BigInt(fetch(escrow.program, "commitment", c.commitment).totalRequired.toString());
    const clientAta = env.tokenAccount(mint, client.publicKey, total);
    assert.ok((await fund(client, c, clientAta, total)).ok);
    return { client, clientAta, total, backers, ...c };
  }

  it("E-04 activate locks min(amount, free) on the backing; one active milestone at a time", async () => {
    const r = ref(20);
    const b = await backedVoucher(r, 1_000n * USDC);
    const { client, commitment } = await fundedCommitment(r, [b], [600n * USDC, 600n * USDC]);

    assert.equal(errorName(await activate(env.funded(), commitment, 0, [b])), "ConstraintHasOne");
    const res = await activate(client, commitment, 0, [b]);
    assert.ok(res.ok, errorName(res));
    const m = fetch(escrow.program, "milestone", milestonePda(commitment, 0));
    assert.deepEqual(m.status, { active: {} });
    assert.equal(m.lockedAmount.toString(), (600n * USDC).toString());
    assert.equal(fetch(bond.program, "backing", b.backing).locked.toString(), (600n * USDC).toString());
    assert.equal(fetch(bond.program, "bondVault", b.vault).locked.toString(), (600n * USDC).toString());
    const cm = fetch(escrow.program, "commitment", commitment);
    assert.deepEqual(cm.status, { active: {} });
    assert.equal(cm.activeMilestone, 0);

    assert.equal(errorName(await activate(client, commitment, 1, [b])), "MilestoneAlreadyActive");
  });

  it("E-04 multi-backing: pro rata by creation-time caps, clamped to live free capacity", async () => {
    const r = ref(21);
    const b1 = await backedVoucher(r, 1_000n * USDC);
    const b2 = await backedVoucher(r, 600n * USDC);
    const { client, commitment } = await fundedCommitment(r, [b1, b2], [800n * USDC]);
    // Voucher 1 lowers its cap after creation: snapshot ratio stays 1000:600, lock clamps to free capacity.
    assert.ok((await env.send(bond.program.methods.updateCap(bn(200n * USDC))
      .accountsStrict({ vault: b1.vault, backing: b1.backing, voucher: b1.kp.publicKey }).instruction(), [b1.kp])).ok);

    assert.equal(errorName(await activate(client, commitment, 0, [b2, b1])), "BackingMismatch"); // order matters
    const res = await activate(client, commitment, 0, [b1, b2]);
    assert.ok(res.ok, errorName(res));
    const m = fetch(escrow.program, "milestone", milestonePda(commitment, 0));
    assert.deepEqual(m.lockedPerBacking.slice(0, 2).map(String), [(200n * USDC).toString(), (300n * USDC).toString()]);
    assert.equal(m.lockedAmount.toString(), (500n * USDC).toString());
  });

  it("E-04 backing with no free capacity fails BackingInsufficient", async () => {
    const r = ref(22);
    const b = await backedVoucher(r, 1_000n * USDC);
    const first = await fundedCommitment(r, [b], [1_000n * USDC]);
    const second = await fundedCommitment(r, [b], [500n * USDC]);
    assert.ok((await activate(first.client, first.commitment, 0, [b])).ok);
    assert.equal(errorName(await activate(second.client, second.commitment, 0, [b])), "BackingInsufficient");
  });

  // ---- T-13 release paths ----
  let partnerAta, treasuryAta;
  const premiumAta = (b) => (b.premiumAta ??= env.tokenAccount(mint, b.kp.publicKey));
  const bal = (a) => env.tokenBalance(a);
  const day = 86400;

  function releaseIx(method, signer, c, index, { partnerAtaOverride } = {}) {
    partnerAta ??= env.tokenAccount(mint, partner);
    treasuryAta ??= env.tokenAccount(mint, treasury);
    return env.send(method.accountsStrict({
      config: escrowConfig, commitment: c.commitment, milestone: milestonePda(c.commitment, index), escrowAta: c.escrowAta,
      partner: partnerPda(partner), partnerAta: partnerAtaOverride ?? partnerAta, treasuryAta, clientAta: c.clientAta,
      escrowAuthority, bondConfig, bondProgram: bond.programId, authority: signer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    }).remainingAccounts(c.backers.flatMap((b) => [
      { pubkey: b.vault, isSigner: false, isWritable: true },
      { pubkey: b.backing, isSigner: false, isWritable: true },
      { pubkey: premiumAta(b), isSigner: false, isWritable: true },
    ])).instruction(), [signer]);
  }
  const approve = (c, i, opts) => releaseIx(escrow.program.methods.approveMilestone(i), c.client, c, i, opts);
  const oracleApprove = (signer, c, i, h) => releaseIx(escrow.program.methods.oracleApprove(i, [...h]), signer, c, i);
  const crank = (c, i) => releaseIx(escrow.program.methods.crankAutoRelease(i), env.funded(), c, i);
  const submit = (signer, c, i) => env.send(escrow.program.methods.submitMilestone(i).accountsStrict({
    config: escrowConfig, commitment: c.commitment, milestone: milestonePda(c.commitment, i), submitter: signer.publicKey,
  }).instruction(), [signer]);
  const events = (res) => res.logs.filter((l) => l.startsWith("Program data: "))
    .map((l) => escrow.program.coder.events.decode(l.slice(14))).filter(Boolean);

  it("E-05 approve releases: partner amount, voucher 3%, treasury 1%, backing unlocked, MilestoneReleased", async () => {
    const r = ref(30);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC]);
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    const [p0, t0] = [bal(partnerAta ?? (partnerAta = env.tokenAccount(mint, partner))), bal(treasuryAta ?? (treasuryAta = env.tokenAccount(mint, treasury)))];

    assert.equal(errorName(await releaseIx(escrow.program.methods.approveMilestone(0), env.funded(), c, 0)), "Unauthorized");
    env.warp(40 * day); // after due_ts: client may still approve (OQ-16)
    const res = await approve(c, 0);
    assert.ok(res.ok, errorName(res));
    assert.equal(bal(partnerAta) - p0, 1_000n * USDC);
    assert.equal(bal(premiumAta(b)), 30n * USDC);
    assert.equal(bal(treasuryAta) - t0, 10n * USDC);
    assert.equal(bal(c.escrowAta), 0n);
    assert.equal(fetch(bond.program, "backing", b.backing).locked.toString(), "0");
    assert.equal(fetch(bond.program, "bondVault", b.vault).premiumsEarned.toString(), (30n * USDC).toString());
    const ev = events(res).find((e) => e.name === "milestoneReleased");
    assert.ok(ev, "MilestoneReleased emitted");
    assert.equal(ev.data.partnerPayout.toString(), (1_000n * USDC).toString());
    // single milestone -> commitment Completed, backing detached
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).status, { completed: {} });
    assert.equal(fetch(bond.program, "backing", b.backing).activeCommitments, 0);
  });

  it("E-06 release to a token account not owned by the partner fails WrongDestination", async () => {
    const r = ref(31);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC]);
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    const evil = env.tokenAccount(mint, c.client.publicKey);
    assert.equal(errorName(await approve(c, 0, { partnerAtaOverride: evil })), "WrongDestination");
    assert.equal(bal(evil), 0n);
  });

  it("E-07 oracle_approve: wrong key fails; wrong ref fails; right key + ref releases", async () => {
    const r = ref(32);
    const prRef = ref(77);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC], { oracleRef: prRef });
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.equal(errorName(await oracleApprove(env.funded(), c, 0, prRef)), "WrongOracle");
    assert.equal(errorName(await oracleApprove(oracle, c, 0, ref(78))), "RefMismatch");
    const res = await oracleApprove(oracle, c, 0, prRef);
    assert.ok(res.ok, errorName(res));
    assert.deepEqual(fetch(escrow.program, "milestone", milestonePda(c.commitment, 0)).status, { released: {} });
  });

  it("E-08 crank needs a submission and a closed window; one restart from inside the window (E-31)", async () => {
    const r = ref(33);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC], { dueIn: 10 * day });
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);

    env.warp(25 * day); // past due + 14d, but nothing submitted
    assert.equal(errorName(await crank(c, 0)), "NotSubmitted");
    assert.equal(errorName(await submit(env.funded(), c, 0)), "Unauthorized");

    assert.ok((await submit(backend, c, 0)).ok); // window = now + 14d
    env.warp(13 * day);
    assert.equal(errorName(await crank(c, 0)), "WindowOpen");
    assert.ok((await submit(partnerKp, c, 0)).ok); // restart on day 13 -> new 14d window
    assert.equal(errorName(await submit(backend, c, 0)), "WindowRestartUsed");
    env.warp(2 * day); // old window would be closed now
    assert.equal(errorName(await crank(c, 0)), "WindowOpen");
    env.warp(12 * day);
    const res = await crank(c, 0);
    assert.ok(res.ok, errorName(res));
  });

  it("E-31 a late resubmission (after the window) cannot restart it", async () => {
    const r = ref(34);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC], { dueIn: 1 * day });
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.ok((await submit(partnerKp, c, 0)).ok);
    env.warp(20 * day);
    assert.equal(errorName(await submit(partnerKp, c, 0)), "WindowRestartUsed");
    assert.ok((await crank(c, 0)).ok);
  });

  it("E-09 a disputed milestone can't be approved, oracle-approved or cranked", async () => {
    const r = ref(35);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC], { dueIn: 1 * day, oracleRef: ref(5) });
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.ok((await submit(partnerKp, c, 0)).ok);
    env.warp(20 * day);
    // simulate disputes.freeze_milestone (CPI lands in T-14)
    const m = milestonePda(c.commitment, 0);
    const acc = env.svm.getAccount(m);
    const data = await escrow.program.coder.accounts.encode("milestone", { ...fetch(escrow.program, "milestone", m), status: { disputed: {} } });
    const full = Buffer.alloc(acc.data.length); Buffer.from(data).copy(full);
    env.svm.setAccount(m, { ...acc, data: full });

    assert.equal(errorName(await approve(c, 0)), "NotActive");
    assert.equal(errorName(await oracleApprove(oracle, c, 0, ref(5))), "NotActive");
    assert.equal(errorName(await crank(c, 0)), "NotActive");
  });

  it("E-10 worked example: 6 × 1,000 → partner 6,000 / voucher 180 / treasury 60; vault intact", async () => {
    const r = ref(36);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], Array(6).fill(1_000n * USDC));
    const [p0, t0] = [bal(partnerAta), bal(treasuryAta)];
    for (let i = 0; i < 6; i++) {
      assert.ok((await activate(c.client, c.commitment, i, [b])).ok);
      const res = await approve(c, i);
      assert.ok(res.ok, errorName(res));
    }
    assert.equal(bal(partnerAta) - p0, 6_000n * USDC);
    assert.equal(bal(premiumAta(b)), 180n * USDC);
    assert.equal(bal(treasuryAta) - t0, 60n * USDC);
    assert.equal(bal(c.escrowAta), 0n);
    const v = fetch(bond.program, "bondVault", b.vault);
    assert.deepEqual([v.deposited, v.allocated, v.locked].map(String), [(1_000n * USDC).toString(), (1_000n * USDC).toString(), "0"]);
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).status, { completed: {} });
  });

  it("E-31 partial cover + sharing: premium scaled and split by actual locks, uncovered premium refunded", async () => {
    const r = ref(37);
    const b1 = await backedVoucher(r, 1_000n * USDC);
    const b2 = await backedVoucher(r, 600n * USDC);
    const c = await fundedCommitment(r, [b1, b2], [800n * USDC], { share: true });
    assert.ok((await env.send(bond.program.methods.updateCap(bn(200n * USDC))
      .accountsStrict({ vault: b1.vault, backing: b1.backing, voucher: b1.kp.publicKey }).instruction(), [b1.kp])).ok);
    assert.ok((await activate(c.client, c.commitment, 0, [b1, b2])).ok); // locks 200 + 300 = 500 of 800
    const p0 = bal(partnerAta);
    assert.ok((await approve(c, 0)).ok);
    // premium 24 × 500/800 = 15 → 6 / 9 by locks; freelancer part = 12 × 500/800 = 7.5 premium + 4 fee
    assert.equal(bal(premiumAta(b1)), 6n * USDC);
    assert.equal(bal(premiumAta(b2)), 9n * USDC);
    assert.equal(bal(partnerAta) - p0, 800n * USDC - 7_500_000n - 4n * USDC);
    assert.equal(bal(c.escrowAta), 0n); // everything funded left escrow
    assert.ok(bal(c.clientAta) > 0n, "uncovered premium refunded to client");
  });

  // ---- T-16 vest + cancel / withdraw (E-34) ----
  const vestIx = (method, signer, c) => env.send(method.accountsStrict({
    commitment: c.commitment, escrowAta: c.escrowAta, partner: partnerPda(partner), partnerAta, clientAta: c.clientAta,
    authority: signer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction(), [signer]);
  const releaseVest = (c) => vestIx(escrow.program.methods.releaseVest(), env.funded(), c);
  const flagLeft = (signer, c) => vestIx(escrow.program.methods.flagVestLeft(), signer, c);
  const vaultAtaOf = (vault) => pda(bond.programId, Buffer.from("vault_ata"), vault.toBuffer());
  const closeIx = (method, signer, c) => env.send(method.accountsStrict({
    config: escrowConfig, commitment: c.commitment, escrowAta: c.escrowAta, partnerAta, clientAta: c.clientAta,
    escrowAuthority, bondConfig, bondProgram: bond.programId, authority: signer.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
  }).remainingAccounts(c.backers.flatMap((b) => [
    { pubkey: b.vault, isSigner: false, isWritable: true },
    { pubkey: b.backing, isSigner: false, isWritable: true },
    { pubkey: vaultAtaOf(b.vault), isSigner: false, isWritable: true },
  ])).instruction(), [signer]);
  const cancel = (c, signer = c.client) => closeIx(escrow.program.methods.cancelCommitment(), signer, c);
  const withdrawC = (c, signer = partnerKp) => closeIx(escrow.program.methods.withdrawCommitment(), signer, c);

  it("E-11 vest: funded up front, starts after completion, pays partner after delay", async () => {
    const r = ref(40);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC], { vest: 100n * USDC, vestDelay: 30 * day });
    assert.equal(c.total, 1_140n * USDC); // 1,000 + 30 premium + 10 fee + 100 vest
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).vestStatus, { held: {} });
    assert.equal(errorName(await releaseVest(c)), "InvalidStatus"); // not completed yet

    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.ok((await approve(c, 0)).ok);
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).vestStatus, { vesting: {} });
    assert.equal(bal(c.escrowAta), 100n * USDC);
    assert.equal(errorName(await releaseVest(c)), "VestNotDue");
    assert.equal(errorName(await flagLeft(c.client, c)), "Unauthorized"); // only the partner may flag

    env.warp(30 * day);
    assert.equal(errorName(await flagLeft(partnerKp, c)), "VestDue"); // too late to flag
    const p0 = bal(partnerAta);
    assert.ok((await releaseVest(c)).ok);
    assert.equal(bal(partnerAta) - p0, 100n * USDC);
    // forgiveness-only: once released nothing can move it back
    assert.equal(errorName(await flagLeft(partnerKp, c)), "InvalidStatus");
    assert.equal(errorName(await releaseVest(c)), "InvalidStatus");
  });

  it("E-11 vest: partner flags the freelancer left before the date, vest back to the client (funder)", async () => {
    const r = ref(41);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC], { vest: 100n * USDC, vestDelay: 30 * day });
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.ok((await approve(c, 0)).ok);
    const c0 = bal(c.clientAta);
    assert.ok((await flagLeft(partnerKp, c)).ok);
    assert.equal(bal(c.clientAta) - c0, 100n * USDC);
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).vestStatus, { refunded: {} });
    env.warp(31 * day);
    assert.equal(errorName(await releaseVest(c)), "InvalidStatus");
  });

  it("E-12 client cancels before any milestone: 5% of remaining salary to partner, rest refunded", async () => {
    const r = ref(42);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC, 1_000n * USDC], { vest: 100n * USDC, vestDelay: day });
    assert.equal(errorName(await cancel(c, env.funded())), "Unauthorized");
    const p0 = bal(partnerAta);
    const res = await cancel(c);
    assert.ok(res.ok, errorName(res));
    assert.equal(bal(partnerAta) - p0, 100n * USDC); // 5% of 2,000
    assert.equal(bal(c.clientAta), c.total - 100n * USDC);
    assert.equal(bal(c.escrowAta), 0n);
    const cm = fetch(escrow.program, "commitment", c.commitment);
    assert.deepEqual(cm.status, { cancelled: {} });
    assert.deepEqual(cm.vestStatus, { refunded: {} });
    assert.equal(fetch(bond.program, "backing", b.backing).activeCommitments, 0);
    assert.equal(errorName(await activate(c.client, c.commitment, 0, [b])), "InvalidStatus");
    assert.equal(errorName(await cancel(c)), "InvalidStatus");
  });

  it("E-12 cancel only between milestones; later cancel charges on remaining salary", async () => {
    const r = ref(43);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC, 1_000n * USDC]);
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.equal(errorName(await cancel(c)), "MilestoneAlreadyActive");
    assert.ok((await approve(c, 0)).ok);
    const p0 = bal(partnerAta);
    const c0 = bal(c.clientAta);
    assert.ok((await cancel(c)).ok);
    assert.equal(bal(partnerAta) - p0, 50n * USDC); // 5% of the remaining 1,000
    assert.equal(bal(c.clientAta) - c0, 1_040n * USDC - 50n * USDC);
  });

  it("E-12 partner withdraws: vouchers pay 10% of remaining salary to client, freelancer forfeits vest", async () => {
    const r = ref(44);
    const b = await backedVoucher(r, 1_000n * USDC);
    const c = await fundedCommitment(r, [b], [1_000n * USDC, 1_000n * USDC], { vest: 100n * USDC, vestDelay: day });
    assert.ok((await activate(c.client, c.commitment, 0, [b])).ok);
    assert.ok((await approve(c, 0)).ok);
    assert.equal(errorName(await withdrawC(c, c.client)), "Unauthorized");
    const p0 = bal(partnerAta);
    const c0 = bal(c.clientAta);
    const res = await withdrawC(c);
    assert.ok(res.ok, errorName(res));
    assert.equal(bal(partnerAta), p0); // nothing more to the freelancer side, nothing taken back
    // escrow balance (1,040 for milestone 2 + 100 vest) + 100 penalty from the bond
    assert.equal(bal(c.clientAta) - c0, 1_140n * USDC + 100n * USDC);
    const v = fetch(bond.program, "bondVault", b.vault);
    assert.equal(v.deposited.toString(), (900n * USDC).toString());
    assert.equal(v.claimsPaid.toString(), (100n * USDC).toString());
    assert.equal(fetch(bond.program, "backing", b.backing).cap.toString(), (900n * USDC).toString());
    assert.deepEqual(fetch(escrow.program, "commitment", c.commitment).vestStatus, { refunded: {} });
  });

  it("admin setters reject non-admin", async () => {
    const x = env.funded();
    for (const m of [escrow.program.methods.setPaused(true), escrow.program.methods.setTreasury(x.publicKey), escrow.program.methods.setFreelancerShare(1)]) {
      assert.equal(errorName(await env.send(m.accountsStrict({ config: escrowConfig, admin: x.publicKey }).instruction(), [x])), "Unauthorized");
    }
    assert.equal(errorName(await env.send(escrow.program.methods.setFreelancerShare(10_001).accountsStrict({ config: escrowConfig, admin: admin.publicKey }).instruction(), [admin])), "InvalidBps");
  });
});
