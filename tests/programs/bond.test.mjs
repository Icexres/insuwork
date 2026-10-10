// insuwork_bond — TEST-PLAN §1 B-01..B-10.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  Env, USDC, anchor, Keypair, PublicKey, SystemProgram, TOKEN_PROGRAM_ID, errorName, programsBuilt,
} from "./harness.mjs";

const { BN } = anchor;
const bn = (x) => new BN(x.toString());
const MIN_BOND = 500n * USDC;
const pda = (programId, ...seeds) => PublicKey.findProgramAddressSync(seeds, programId)[0];
const ref = (n) => Buffer.alloc(32, n); // stand-in freelancer_ref hash

describe("insuwork_bond", { skip: !programsBuilt() && "run `anchor build` first" }, () => {
  let env, program, programId, programData, admin, mint, config;
  const escrowProgram = Keypair.generate().publicKey;
  const disputesProgram = Keypair.generate().publicKey;

  const vaultOf = (voucher) => pda(programId, Buffer.from("vault"), voucher.toBuffer());
  const vaultAtaOf = (vault) => pda(programId, Buffer.from("vault_ata"), vault.toBuffer());
  const backingOf = (vault, r) => pda(programId, Buffer.from("backing"), vault.toBuffer(), r);
  const fetch = (name, addr) => program.coder.accounts.decode(name, Buffer.from(env.svm.getAccount(addr).data));
  const patch = async (name, addr, changes) => {
    const acc = env.svm.getAccount(addr);
    const data = await program.coder.accounts.encode(name, { ...fetch(name, addr), ...changes });
    // encode may return a shorter buffer than the allocated space; keep the original length.
    const full = Buffer.alloc(acc.data.length);
    Buffer.from(data).copy(full);
    env.svm.setAccount(addr, { ...acc, data: full });
  };

  async function newVoucher(balance = 10_000n * USDC) {
    const voucher = env.funded();
    const ata = env.tokenAccount(mint, voucher.publicKey, balance);
    const vault = vaultOf(voucher.publicKey);
    const res = await env.send(program.methods.initVault().accountsStrict({
      config, vault, vaultAta: vaultAtaOf(vault), usdcMint: mint, voucher: voucher.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
    }).instruction(), [voucher]);
    assert.ok(res.ok, errorName(res));
    return { kp: voucher, ata, vault, vaultAta: vaultAtaOf(vault) };
  }

  const deposit = (v, amount) => env.send(program.methods.deposit(bn(amount)).accountsStrict({
    config, vault: v.vault, vaultAta: v.vaultAta, voucherAta: v.ata, voucher: v.kp.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction(), [v.kp]);

  const withdraw = (v, amount, vault = v.vault) => env.send(program.methods.withdraw(bn(amount)).accountsStrict({
    config, vault, vaultAta: vaultAtaOf(vault), voucherAta: v.ata, voucher: v.kp.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
  }).instruction(), [v.kp]);

  const createBacking = (v, r, cap) => env.send(program.methods.createBacking([...r], bn(cap)).accountsStrict({
    config, vault: v.vault, backing: backingOf(v.vault, r), voucher: v.kp.publicKey,
    systemProgram: SystemProgram.programId,
  }).instruction(), [v.kp]);

  const voucherBacking = (v, r) => ({ vault: v.vault, backing: backingOf(v.vault, r), voucher: v.kp.publicKey });

  before(async () => {
    env = new Env();
    admin = env.funded();
    ({ program, programId, programData } = env.deployUpgradeable("insuwork_bond", admin.publicKey));
    mint = env.createMint();
    config = pda(programId, Buffer.from("bond_config"));
  });

  it("init_config rejects a signer who is not the upgrade authority", async () => {
    const intruder = env.funded();
    const res = await env.send(program.methods.initConfig({ escrowProgram, disputesProgram, minBond: bn(MIN_BOND) })
      .accountsStrict({ config, usdcMint: mint, admin: intruder.publicKey, program: programId, programData, systemProgram: SystemProgram.programId })
      .instruction(), [intruder]);
    assert.equal(errorName(res), "Unauthorized");
  });

  it("init_config by the upgrade authority", async () => {
    const res = await env.send(program.methods.initConfig({ escrowProgram, disputesProgram, minBond: bn(MIN_BOND) })
      .accountsStrict({ config, usdcMint: mint, admin: admin.publicKey, program: programId, programData, systemProgram: SystemProgram.programId })
      .instruction(), [admin]);
    assert.ok(res.ok, errorName(res));
    assert.equal(fetch("bondConfig", config).minBond.toString(), MIN_BOND.toString());
  });

  it("B-01 init_vault + deposit ≥ min_bond; vault_ata == deposited", async () => {
    const v = await newVoucher();
    const res = await deposit(v, 1_000n * USDC);
    assert.ok(res.ok, errorName(res));
    assert.equal(fetch("bondVault", v.vault).deposited.toString(), (1_000n * USDC).toString());
    assert.equal(env.tokenBalance(v.vaultAta), 1_000n * USDC);
  });

  it("B-02 first deposit below min_bond fails BelowMinBond", async () => {
    const v = await newVoucher();
    assert.equal(errorName(await deposit(v, 100n * USDC)), "BelowMinBond");
  });

  it("min_bond applies only to the first deposit; later top-ups may be small", async () => {
    const v = await newVoucher();
    assert.ok((await deposit(v, MIN_BOND)).ok);
    assert.ok((await deposit(v, 1n * USDC)).ok);
    assert.equal(fetch("bondVault", v.vault).deposited.toString(), (MIN_BOND + USDC).toString());
  });

  it("set_paused: only admin; paused blocks deposit", async () => {
    const v = await newVoucher();
    const setPaused = (signer, p) => env.send(program.methods.setPaused(p)
      .accountsStrict({ config, admin: signer.publicKey }).instruction(), [signer]);
    assert.equal(errorName(await setPaused(v.kp, true)), "Unauthorized");
    assert.ok((await setPaused(admin, true)).ok);
    assert.equal(errorName(await deposit(v, 1_000n * USDC)), "Paused");
    assert.ok((await setPaused(admin, false)).ok);
    assert.ok((await deposit(v, 1_000n * USDC)).ok);
  });

  it("B-03 create_backing within leverage; allocated updated", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    const res = await createBacking(v, ref(1), 600n * USDC);
    assert.ok(res.ok, errorName(res));
    const vault = fetch("bondVault", v.vault);
    assert.equal(vault.allocated.toString(), (600n * USDC).toString());
    assert.equal(vault.backingsCount, 1);
    const b = fetch("backing", backingOf(v.vault, ref(1)));
    assert.equal(b.active, true);
    assert.equal(b.cap.toString(), (600n * USDC).toString());
  });

  it("B-04 create_backing exceeding deposited fails ExceedsLeverage", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    assert.equal(errorName(await createBacking(v, ref(1), 1_001n * USDC)), "ExceedsLeverage");
    assert.ok((await createBacking(v, ref(2), 700n * USDC)).ok);
    assert.equal(errorName(await createBacking(v, ref(3), 301n * USDC)), "ExceedsLeverage");
  });

  it("B-05 withdraw below allocated fails; below min_bond (non-zero) fails; valid withdraw ok", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    await createBacking(v, ref(1), 600n * USDC);
    assert.equal(errorName(await withdraw(v, 401n * USDC)), "InsufficientUnallocated");
    assert.equal(errorName(await withdraw(v, 1_000n * USDC)), "InsufficientUnallocated");

    const w = await newVoucher();
    await deposit(w, 1_000n * USDC);
    assert.equal(errorName(await withdraw(w, 600n * USDC)), "BelowMinBond"); // leaves 400 < 500
    assert.ok((await withdraw(w, 400n * USDC)).ok);
    assert.equal(env.tokenBalance(w.vaultAta), 600n * USDC);
    assert.ok((await withdraw(w, 600n * USDC)).ok); // to zero is allowed
    assert.equal(fetch("bondVault", w.vault).deposited.toString(), "0");
  });

  it("B-06 lock/unlock/attach by a non-escrow_authority signer fail UnauthorizedCaller", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    await createBacking(v, ref(1), 600n * USDC);
    const accts = { config, escrowAuthority: v.kp.publicKey, vault: v.vault, backing: backingOf(v.vault, ref(1)) };
    for (const m of [program.methods.lock(bn(USDC)), program.methods.unlock(bn(0)), program.methods.attachCommitment(), program.methods.recordPremium(bn(1))]) {
      assert.equal(errorName(await env.send(m.accountsStrict(accts).instruction(), [v.kp])), "UnauthorizedCaller");
    }
  });

  it("B-07 pay_claim by a non-disputes_authority signer fails UnauthorizedCaller", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    await createBacking(v, ref(1), 600n * USDC);
    const thief = env.funded();
    const thiefAta = env.tokenAccount(mint, thief.publicKey);
    const res = await env.send(program.methods.payClaim(bn(0)).accountsStrict({
      config, disputesAuthority: thief.publicKey, vault: v.vault, vaultAta: v.vaultAta,
      backing: backingOf(v.vault, ref(1)), recipientAta: thiefAta, tokenProgram: TOKEN_PROGRAM_ID,
    }).instruction(), [thief]);
    assert.equal(errorName(res), "UnauthorizedCaller");
    assert.equal(env.tokenBalance(thiefAta), 0n);
  });

  it("B-08 update_cap below locked fails; within leverage ok", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    await createBacking(v, ref(1), 600n * USDC);
    const b = backingOf(v.vault, ref(1));
    await patch("backing", b, { locked: bn(500n * USDC) }); // simulate escrow lock (CPI path tested in T-12)
    const upd = (cap) => env.send(program.methods.updateCap(bn(cap)).accountsStrict(voucherBacking(v, ref(1))).instruction(), [v.kp]);
    assert.equal(errorName(await upd(499n * USDC)), "CapBelowLocked");
    assert.equal(errorName(await upd(1_001n * USDC)), "ExceedsLeverage");
    assert.ok((await upd(1_000n * USDC)).ok);
    assert.equal(fetch("bondVault", v.vault).allocated.toString(), (1_000n * USDC).toString());
  });

  it("B-09 two vouchers' vaults are independent", async () => {
    const a = await newVoucher();
    const b = await newVoucher();
    await deposit(a, 1_000n * USDC);
    await deposit(b, 2_000n * USDC);
    const res = await withdraw(a, 500n * USDC, b.vault); // A tries to drain B's vault
    assert.ok(!res.ok);
    assert.equal(env.tokenBalance(b.vaultAta), 2_000n * USDC);
    assert.equal(env.tokenBalance(a.vaultAta), 1_000n * USDC);
  });

  it("B-10 close_backing with locked > 0 fails; with a live commitment fails (OQ-7); otherwise frees allocation", async () => {
    const v = await newVoucher();
    await deposit(v, 1_000n * USDC);
    await createBacking(v, ref(1), 600n * USDC);
    const b = backingOf(v.vault, ref(1));
    const close = () => env.send(program.methods.closeBacking().accountsStrict(voucherBacking(v, ref(1))).instruction(), [v.kp]);

    await patch("backing", b, { locked: bn(1) });
    assert.equal(errorName(await close()), "BackingLocked");
    await patch("backing", b, { locked: bn(0), activeCommitments: 1 });
    assert.equal(errorName(await close()), "BackingInUse");
    await patch("backing", b, { activeCommitments: 0 });
    assert.ok((await close()).ok);
    assert.equal(fetch("backing", b).active, false);
    assert.equal(fetch("bondVault", v.vault).allocated.toString(), "0");
  });

});
