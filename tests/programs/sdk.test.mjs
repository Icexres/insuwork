// packages/sdk (T-17): PDA helpers, builders, event decoding, and a 4-backing finalize that only
// fits in a v0 transaction with the commitment's lookup table (E-36).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { Env, USDC, anchor, Keypair, SystemProgram, TOKEN_PROGRAM_ID, errorName, programsBuilt } from "./harness.mjs";
import * as sdk from "../../packages/sdk/src/index.ts";
import * as indexer from "../../services/indexer/src/index.ts";

const { BN } = anchor;
const bn = (x) => new BN(x.toString());
const day = 86400;
const REF = Buffer.alloc(32, 0xab);

describe("@insuwork/sdk", { skip: !programsBuilt() && "run `anchor build` first" }, () => {
  let env, admin, p, mint, partner, treasury;
  const panel = [];
  let finalLogs, finalCommitment; // reused by the indexer test

  const balOf = (owner) => env.tokenBalance(sdk.ata(owner, mint));
  const send = async (ixs, signers) => {
    const res = await env.send(ixs, signers);
    assert.ok(res.ok, errorName(res));
    return res;
  };

  before(async () => {
    env = new Env();
    admin = env.funded();
    const deployed = ["insuwork_bond", "insuwork_escrow", "insuwork_disputes"].map((n) => env.deployUpgradeable(n, admin.publicKey));
    p = sdk.programs(new anchor.AnchorProvider(env.connection(), new anchor.Wallet(admin), {}));
    mint = env.createMint();
    partner = Keypair.generate().publicKey;
    treasury = Keypair.generate().publicKey;
    for (const owner of [partner, treasury]) env.tokenAccountAt(sdk.ata(owner, mint), mint, owner);

    const init = (prog, d, config, params) => prog.methods.initConfig(params).accountsStrict({
      config, usdcMint: mint, admin: admin.publicKey, program: d.programId, programData: d.programData, systemProgram: SystemProgram.programId,
    }).instruction();
    await send([
      init(p.bond, deployed[0], sdk.pdas.bondConfig(), { escrowProgram: sdk.ESCROW_PROGRAM_ID, disputesProgram: sdk.DISPUTES_PROGRAM_ID, minBond: sdk.usdc(500) }),
      init(p.escrow, deployed[1], sdk.pdas.escrowConfig(), {
        bondProgram: sdk.BOND_PROGRAM_ID, disputesProgram: sdk.DISPUTES_PROGRAM_ID, treasury, githubOracle: Keypair.generate().publicKey,
        submitter: Keypair.generate().publicKey, premiumBps: 300, platformFeeBps: 100, freelancerShareBps: 5000,
        claimWindowSecs: bn(14 * day), cancelFeeBps: 500, withdrawPenaltyBps: 1000,
      }),
      init(p.disputes, deployed[2], sdk.pdas.disputesConfig(), {
        escrowProgram: sdk.ESCROW_PROGRAM_ID, bondProgram: sdk.BOND_PROGRAM_ID, treasury, rulingSecs: bn(7 * day), claimFee: sdk.usdc(10),
      }),
      p.escrow.methods.registerPartner(partner, [...Buffer.alloc(32, 0x4d)], true).accountsStrict({
        config: sdk.pdas.escrowConfig(), partner: sdk.pdas.partner(partner), admin: admin.publicKey, systemProgram: SystemProgram.programId,
      }).instruction(),
    ], [admin]);
    for (let i = 0; i < 3; i++) {
      panel.push(env.funded());
      await send(p.disputes.methods.addPanelist(panel[i].publicKey).accountsStrict({
        config: sdk.pdas.disputesConfig(), panelist: sdk.pdas.panelist(panel[i].publicKey), admin: admin.publicKey, systemProgram: SystemProgram.programId,
      }).instruction(), [admin]);
    }
  });

  it("PDA helpers match the programs' seeds", () => {
    assert.equal(sdk.BOND_PROGRAM_ID.toBase58(), "7DpVomUkF1FfXxsf6gcdvmpFcAZBS7cTm7TvhNSjbKE1");
    assert.ok(env.svm.getAccount(sdk.pdas.bondConfig()));
    assert.ok(env.svm.getAccount(sdk.pdas.escrowConfig()));
    assert.ok(env.svm.getAccount(sdk.pdas.disputesConfig()));
    assert.ok(env.svm.getAccount(sdk.pdas.partner(partner)));
  });

  it("4-backing upheld claim: legacy finalize is too large, v0 + lookup table succeeds; events decode", async () => {
    // four vouchers back the same freelancer
    const backers = [];
    for (let i = 0; i < 4; i++) {
      const kp = env.funded();
      const vault = sdk.pdas.vault(kp.publicKey);
      const voucherAta = env.tokenAccountAt(sdk.ata(kp.publicKey, mint), mint, kp.publicKey, 500n * USDC);
      await send([
        p.bond.methods.initVault().accountsStrict({
          config: sdk.pdas.bondConfig(), vault, vaultAta: sdk.pdas.vaultAta(vault), usdcMint: mint, voucher: kp.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        }).instruction(),
        p.bond.methods.deposit(sdk.usdc(500)).accountsStrict({
          config: sdk.pdas.bondConfig(), vault, vaultAta: sdk.pdas.vaultAta(vault), voucherAta, voucher: kp.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
        }).instruction(),
        p.bond.methods.createBacking([...REF], sdk.usdc(500)).accountsStrict({
          config: sdk.pdas.bondConfig(), vault, backing: sdk.pdas.backing(vault, REF), voucher: kp.publicKey, systemProgram: SystemProgram.programId,
        }).instruction(),
      ], [kp]);
      backers.push({ vault, backing: sdk.pdas.backing(vault, REF) });
    }

    const client = env.funded();
    const commitment = sdk.pdas.commitment(client.publicKey, 1);
    const clientAta = env.tokenAccountAt(sdk.ata(client.publicKey, mint), mint, client.publicKey, 2_000n * USDC);
    await send(p.escrow.methods.createCommitment(bn(1), [...REF], 1, false, bn(0), bn(0)).accountsStrict({
      config: sdk.pdas.escrowConfig(), commitment, escrowAta: sdk.pdas.escrowAta(commitment), usdcMint: mint,
      partner: sdk.pdas.partner(partner), escrowAuthority: sdk.pdas.escrowAuthority(), bondConfig: sdk.pdas.bondConfig(),
      bondProgram: sdk.BOND_PROGRAM_ID, client: client.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).remainingAccounts(sdk.remaining.pairs(backers)).instruction(), [client]);
    const due = env.svm.getClock().unixTimestamp + BigInt(30 * day);
    await send(p.escrow.methods.addMilestone(0, {
      amount: sdk.usdc(1_000), dueTs: bn(due), specHash: [...Buffer.alloc(32, 9)], releaseMode: { clientSig: {} }, githubRefHash: [...Buffer.alloc(32)],
    }).accountsStrict({ commitment, milestone: sdk.pdas.milestone(commitment, 0), client: client.publicKey, systemProgram: SystemProgram.programId }).instruction(), [client]);
    await send(p.escrow.methods.fund(sdk.usdc(1_040)).accountsStrict({
      config: sdk.pdas.escrowConfig(), commitment, escrowAta: sdk.pdas.escrowAta(commitment), clientAta, client: client.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction(), [client]);

    // everything else via the SDK context + builders
    const c = await sdk.loadCommitment(p, commitment);
    assert.equal(c.backings.length, 4);
    await send(sdk.activateMilestoneIx(p, c, 0), [client]);
    assert.deepEqual(c.backings.map((b) => p.bond.coder.accounts.decode("backing", Buffer.from(env.svm.getAccount(b.backing).data)).locked.toString()),
      Array(4).fill((250n * USDC).toString()));
    await send(sdk.fileClaimIx(p, c, 0, Buffer.alloc(32, 1)), [client]);
    await send(sdk.assignPanelIx(p, c, 0, admin.publicKey, panel.map((k) => k.publicKey)), [admin]);
    await send(sdk.castVoteIx(p, c, 0, panel[0].publicKey, 1), [panel[0]]);
    await send(sdk.castVoteIx(p, c, 0, panel[1].publicKey, 1), [panel[1]]);

    const cranker = env.funded();
    const finalizeIx = await sdk.finalizeClaimIx(p, c, 0);
    await assert.rejects(env.send(finalizeIx, [cranker]), /too large|overrun|exceeds/i, "legacy tx should not fit");

    const addresses = sdk.commitmentLookupAddresses(c);
    const lut = env.lookupTable(addresses, admin.publicKey);
    const before = balOf(client.publicKey);
    const res = env.sendV0(sdk.buildV0Tx(cranker.publicKey, [finalizeIx], env.svm.latestBlockhash(), [lut], sdk.MULTI_BACKING_COMPUTE_UNITS), [cranker]);
    assert.ok(res.ok, errorName(res));
    // bond 4 × 250 + salary/premium refund 1,030 + claim fee 10 back
    assert.equal(balOf(client.publicKey) - before, 2_040n * USDC);

    finalLogs = res.logs;
    finalCommitment = commitment;
    const events = sdk.decodeEvents(p, res.logs);
    const names = events.map((e) => `${e.program}.${e.name}`);
    assert.equal(names.filter((n) => n === "bond.claimPaid").length, 4);
    assert.ok(names.includes("escrow.milestoneResolved"));
    assert.ok(names.includes("disputes.claimFinalized"));
  });

  it("indexer (T-22): stores events once and mirrors every touched account, parents first", async () => {
    const tables = {};
    const FK = { backings: ["vault", "vaults"], milestones: ["commitment", "commitments"], claims: ["milestone", "milestones"] };
    const keyOf = (t, r) => (t === "events_raw" ? `${r.sig}/${r.ix_index}/${r.event_index}` : r.pubkey);
    const db = {
      from: (t) => ({
        upsert: async (rows, opts = {}) => {
          const rowsArr = Array.isArray(rows) ? rows : [rows];
          tables[t] ??= new Map();
          for (const r of rowsArr) {
            if (FK[t] && !tables[FK[t][1]]?.has(r[FK[t][0]])) return { error: { message: `fk ${t}.${FK[t][0]}` } };
            const k = keyOf(t, r);
            if (!(opts.ignoreDuplicates && tables[t].has(k))) tables[t].set(k, { ...tables[t].get(k), ...r });
          }
          return { error: null };
        },
        update: (patch) => {
          const conds = [];
          const q = {
            eq: (col, v) => (conds.push([col, v]), q),
            then: (res) => {
              for (const r of tables[t]?.values() ?? []) if (conds.every(([c, v]) => r[c] === v)) Object.assign(r, patch);
              return res({ error: null });
            },
          };
          return q;
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    };
    const getAccount = async (k) => {
      const a = env.svm.getAccount(k);
      return a && { ...a, data: Buffer.from(a.data) };
    };
    const ctx = { p, db, getAccount };
    const n = await indexer.ingest(ctx, "sig1", 7, finalLogs);
    assert.ok(n >= 6);
    assert.equal(await indexer.ingest(ctx, "sig1", 7, finalLogs), n, "replay");
    assert.equal(tables.events_raw.size, n, "replay stored nothing new");
    assert.equal([...tables.events_raw.values()].filter((e) => e.name === "claimPaid").length, 4);
    assert.ok([...tables.events_raw.values()].every((e) => e.instruction === "Finalize"));

    const c = tables.commitments.get(finalCommitment.toBase58());
    assert.equal(c.vouchers.length, 4);
    assert.equal(tables.vaults.size, 4);
    assert.equal(tables.backings.size, 4);
    const m = tables.milestones.get(sdk.pdas.milestone(finalCommitment, 0).toBase58());
    assert.equal(m.status, "resolved");
    assert.equal(m.tx_sig, "sig1");
    const claim = [...tables.claims.values()][0];
    assert.equal(claim.outcome, "upheld");
    assert.equal(claim.panel.length, 3);
    assert.match(c.freelancer_ref, /^(ab){32}$/);
  });

  it("createLookupTableIxs chunks extends under the tx limit", () => {
    const addrs = Array.from({ length: 45 }, () => Keypair.generate().publicKey);
    const { lookupTable, create, extend } = sdk.createLookupTableIxs(admin.publicKey, admin.publicKey, 1, addrs);
    assert.ok(lookupTable && create);
    assert.equal(extend.length, 3);
  });
});
