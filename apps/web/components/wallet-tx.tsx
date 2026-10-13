"use client";
// Shared wallet-transaction plumbing for the wallet roles' action forms (rule 1: never imported by freelancer pages).
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as anchor from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";

const t = en.common.tx;
const USDC = 1_000_000n;

/** "1,234.5" → base units, or null. Integer math only. */
export const parseUsd = (s: string) => {
  const m = s.replace(/,/g, "").trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  return m ? BigInt(m[1]) * USDC + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
};
export const bn = (x: bigint | number) => new anchor.BN(x.toString());

/** Retry RPC calls the public devnet endpoint rate-limits (429). Re-sending the same signed tx is safe: a signature lands once. */
async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1 || !/429|rate limit|Too Many Requests|fetch failed/i.test((e as Error).message)) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

/** One instruction list = one tx; a list of lists = several txs signed with one wallet prompt, sent in order. */
type Build = (p: sdk.Programs, me: PublicKey) => Promise<TransactionInstruction[] | TransactionInstruction[][]>;

/** Build → sign with the connected wallet → confirm (v0 tx, raised CU limit) → refresh server data. */
export function useSend() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; msg?: string; sig?: string }>({ busy: false });
  const run = async (build: Build, onDone?: (sig: string) => Promise<void> | void) => {
    if (!wallet) return setState({ busy: false, msg: t.connect });
    setState({ busy: true, msg: t.submitting });
    try {
      const p = sdk.programs(new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      const built = await withRetry(() => build(p, wallet.publicKey));
      const groups = (Array.isArray(built[0]) ? built : [built]) as TransactionInstruction[][];
      const { blockhash, lastValidBlockHeight } = await withRetry(() => connection.getLatestBlockhash("confirmed"));
      const txs = groups.map((ixs) => sdk.buildV0Tx(wallet.publicKey, ixs, blockhash, [], sdk.MULTI_BACKING_COMPUTE_UNITS));
      let sig = "";
      for (const tx of await wallet.signAllTransactions(txs)) {
        sig = await withRetry(() => connection.sendTransaction(tx));
        const res = await withRetry(() => connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed"));
        if (res.value.err) throw new Error(JSON.stringify(res.value.err));
      }
      await onDone?.(sig);
      setState({ busy: false, msg: t.done, sig });
      router.refresh();
    } catch (e) {
      setState({ busy: false, msg: `${t.failed} ${(e as Error).message.slice(0, 160)}` });
    }
  };
  return { ...state, run };
}

export function TxStatus({ msg, sig, error }: { msg?: string; sig?: string; error?: string }) {
  if (!msg && !error) return null;
  return (
    <p role={error ? "alert" : "status"} className="text-[13px] text-muted">
      {error ?? msg}{" "}
      {sig && !error && (
        <a className="underline" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">{t.viewTx}</a>
      )}
    </p>
  );
}
