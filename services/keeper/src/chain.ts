// Live wiring for keeperPass: candidates from the Supabase mirror, state + sends on-chain.
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as sdk from "@insuwork/sdk";
import type { KeeperDeps } from "./index.ts";

const variant = (e: object) => Object.keys(e)[0];

async function send(conn: Connection, signer: Keypair, ixs: TransactionInstruction[]) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = sdk.buildV0Tx(signer.publicKey, ixs, blockhash, [], sdk.MULTI_BACKING_COMPUTE_UNITS);
  tx.sign([signer]);
  const sig = await conn.sendTransaction(tx);
  const res = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

export async function chainKeeperDeps(conn: Connection, db: SupabaseClient, keeper: Keypair): Promise<KeeperDeps> {
  const readOnly = { publicKey: keeper.publicKey, signTransaction: () => Promise.reject(), signAllTransactions: () => Promise.reject() };
  const p = sdk.programs(new anchor.AnchorProvider(conn, readOnly as never, { commitment: "confirmed" }));
  const cfg = await p.escrow.account.escrowConfig.fetch(sdk.pdas.escrowConfig());
  const ms = (c: string, i: number) => sdk.pdas.milestone(new PublicKey(c), i);
  return {
    now: Math.floor(Date.now() / 1000),
    claimWindowSecs: cfg.claimWindowSecs.toNumber(),
    candidates: async () => {
      const [{ data: m }, { data: v }] = await Promise.all([
        db.from("milestones").select("commitment, index").eq("status", "active").not("submitted_ts", "is", null),
        db.from("commitments").select("pubkey").eq("vest_status", "vesting"),
      ]);
      return { milestones: m ?? [], vests: (v ?? []).map((r) => r.pubkey) };
    },
    milestone: async (c, i) => {
      const m = await p.escrow.account.milestone.fetchNullable(ms(c, i));
      return m && { status: variant(m.status), submissions: m.submissions, dueTs: m.dueTs.toNumber(), submittedTs: m.submittedTs.toNumber() };
    },
    vest: async (c) => {
      const x = await p.escrow.account.commitment.fetchNullable(new PublicKey(c));
      return x && { status: variant(x.vestStatus), dueTs: x.vestDueTs.toNumber() };
    },
    crank: async (c, i) => send(conn, keeper, [await sdk.crankAutoReleaseIx(p, await sdk.loadCommitment(p, new PublicKey(c)), i, keeper.publicKey)]),
    releaseVest: async (c) => send(conn, keeper, [await sdk.releaseVestIx(p, await sdk.loadCommitment(p, new PublicKey(c)), keeper.publicKey)]),
  };
}
