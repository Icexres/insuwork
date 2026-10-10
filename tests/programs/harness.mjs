// LiteSVM test harness (T-04): programs from target/deploy, test USDC mint, clock warp.
// LiteSVM has no Windows binary — run via `pnpm test:programs:docker` on Windows.
import { readFileSync, existsSync } from "node:fs";
import { LiteSVM, Clock } from "litesvm";
import anchor from "@coral-xyz/anchor";
import {
  Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, MINT_SIZE, ACCOUNT_SIZE, MintLayout, AccountLayout,
} from "@solana/spl-token";

export const TEST_USDC_DECIMALS = 6;
export const USDC = 1_000_000n; // 1 USDC in base units
export const CLAIM_WINDOW_SECS = 14 * 24 * 3600; // 14-day window (E-08)
export const RULING_WINDOW_SECS = 7 * 24 * 3600; // 7-day ruling window

export function warpClock(nowSecs, deltaSecs) {
  return nowSecs + deltaSecs;
}

export function isClaimOpen(nowSecs, dueTs) {
  return nowSecs <= dueTs + CLAIM_WINDOW_SECS;
}

const ALT_PROGRAM = new PublicKey("AddressLookupTab1e1111111111111111111111111");
const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export function loadIdl(name) {
  return JSON.parse(readFileSync(`target/idl/${name}.json`, "utf8"));
}

export const programsBuilt = () => existsSync("target/deploy/insuwork_bond.so");

export class Env {
  constructor() {
    this.svm = new LiteSVM();
    this.payer = this.funded();
  }

  funded() {
    const kp = Keypair.generate();
    this.svm.airdrop(kp.publicKey, BigInt(100 * LAMPORTS_PER_SOL));
    return kp;
  }

  /** Deploy as an upgradeable program so ProgramData.upgrade_authority is real. */
  deployUpgradeable(name, upgradeAuthority) {
    const idl = loadIdl(name);
    const programId = new PublicKey(idl.address);
    const elf = readFileSync(`target/deploy/${name}.so`);
    const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], UPGRADEABLE_LOADER);

    const prog = Buffer.alloc(36);
    prog.writeUInt32LE(2, 0); // UpgradeableLoaderState::Program
    programData.toBuffer().copy(prog, 4);

    const meta = Buffer.alloc(45);
    meta.writeUInt32LE(3, 0); // UpgradeableLoaderState::ProgramData
    meta.writeBigUInt64LE(0n, 4); // slot
    meta.writeUInt8(1, 12); // Some(authority)
    upgradeAuthority.toBuffer().copy(meta, 13);
    const pd = Buffer.concat([meta, elf]);

    const rent = (len) => this.svm.minimumBalanceForRentExemption(BigInt(len));
    this.svm.setAccount(programData, { lamports: Number(rent(pd.length)), data: pd, owner: UPGRADEABLE_LOADER, executable: false });
    this.svm.setAccount(programId, { lamports: Number(rent(36)), data: prog, owner: UPGRADEABLE_LOADER, executable: true });

    const provider = new anchor.AnchorProvider({}, new anchor.Wallet(this.payer), {});
    return { program: new anchor.Program(idl, provider), programId, programData };
  }

  createMint(decimals = TEST_USDC_DECIMALS) {
    const mint = Keypair.generate().publicKey;
    const data = Buffer.alloc(MINT_SIZE);
    MintLayout.encode({
      mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 0n, decimals,
      isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default,
    }, data);
    this.setTokenProgramAccount(mint, data);
    return mint;
  }

  /** Token account with a given balance, written directly (test-only shortcut). */
  tokenAccount(mint, owner, amount = 0n) {
    const addr = Keypair.generate().publicKey;
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode({
      mint, owner, amount: BigInt(amount), delegateOption: 0, delegate: PublicKey.default,
      state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
      closeAuthorityOption: 0, closeAuthority: PublicKey.default,
    }, data);
    this.setTokenProgramAccount(addr, data);
    return addr;
  }

  setTokenProgramAccount(addr, data) {
    this.svm.setAccount(addr, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(data.length))),
      data, owner: TOKEN_PROGRAM_ID, executable: false,
    });
  }

  /** Token account at a fixed address (e.g. the owner's ATA). */
  tokenAccountAt(addr, mint, owner, amount = 0n) {
    const data = Buffer.alloc(ACCOUNT_SIZE);
    AccountLayout.encode({
      mint, owner, amount: BigInt(amount), delegateOption: 0, delegate: PublicKey.default,
      state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
      closeAuthorityOption: 0, closeAuthority: PublicKey.default,
    }, data);
    this.setTokenProgramAccount(addr, data);
    return addr;
  }

  /** Read-only Connection shim so Anchor's `account.x.fetch` works against LiteSVM. */
  connection() {
    const svm = this.svm;
    const getAccountInfo = async (pk) => {
      const a = svm.getAccount(pk);
      return a && { ...a, data: Buffer.from(a.data), owner: new PublicKey(a.owner), lamports: Number(a.lamports) };
    };
    return {
      getAccountInfo,
      getAccountInfoAndContext: async (pk) => ({ context: { slot: Number(svm.getClock().slot) }, value: await getAccountInfo(pk) }),
    };
  }

  /**
   * Write an active address lookup table directly (test shortcut: LiteSVM has no recent
   * SlotHashes for createLookupTable). Real creation uses sdk.createLookupTableIxs.
   */
  lookupTable(addresses, authority) {
    const addr = Keypair.generate().publicKey;
    const meta = Buffer.alloc(56);
    meta.writeUInt32LE(1, 0); // ProgramState::LookupTable
    meta.writeBigUInt64LE(0xffffffffffffffffn, 4); // deactivation_slot: active
    meta.writeBigUInt64LE(0n, 12); // last_extended_slot
    meta.writeUInt8(0, 20); // last_extended_slot_start_index
    meta.writeUInt8(1, 21); // Some(authority)
    authority.toBuffer().copy(meta, 22);
    const data = Buffer.concat([meta, ...addresses.map((a) => a.toBuffer())]);
    this.svm.setAccount(addr, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(data.length))),
      data, owner: ALT_PROGRAM, executable: false,
    });
    const c = this.svm.getClock(); // tables are usable from the slot after their last extension
    this.svm.setClock(new Clock(c.slot + 2n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, c.unixTimestamp));
    return new AddressLookupTableAccount({ key: addr, state: AddressLookupTableAccount.deserialize(data) });
  }

  /** Send a VersionedTransaction (already built); signs and returns { ok, logs, err }. */
  sendV0(tx, signers) {
    tx.message.recentBlockhash = this.svm.latestBlockhash();
    tx.sign(signers);
    const res = this.svm.sendTransaction(tx);
    this.svm.expireBlockhash();
    if (typeof res.err === "function") return { ok: false, err: res.err(), logs: res.meta().logs() };
    return { ok: true, logs: res.logs() };
  }

  tokenBalance(addr) {
    return AccountLayout.decode(this.svm.getAccount(addr).data).amount;
  }

  /** Send instructions; returns { ok, logs, err }. Never throws on program errors. */
  async send(ixs, signers) {
    const tx = new Transaction();
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    for (const ix of [].concat(ixs)) tx.add(await ix);
    tx.sign(...signers);
    const res = this.svm.sendTransaction(tx);
    this.svm.expireBlockhash();
    if (typeof res.err === "function") {
      return { ok: false, err: res.err(), logs: res.meta().logs() };
    }
    return { ok: true, logs: res.logs() };
  }

  warp(deltaSecs) {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, c.unixTimestamp + BigInt(deltaSecs)));
  }
}

/** Assert a failed tx carries a named Anchor error. */
export function errorName(res) {
  if (res.ok) return null;
  const line = res.logs.find((l) => l.includes("Error Code:"));
  return line ? line.match(/Error Code: (\w+)/)[1] : `raw:${res.logs.slice(-2).join(" | ")}`;
}

export { anchor, Keypair, PublicKey, SystemProgram, TOKEN_PROGRAM_ID };
