"use client";
// Voucher wallet actions (VO-1, VO-2, VO-4). Only rendered under /voucher (wallet layout, rule 1).
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as anchor from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";

const t = en.voucher.actions;
const USDC = 1_000_000n;
const parse = (s: string) => {
  const m = s.replace(/,/g, "").trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  return m ? BigInt(m[1]) * USDC + BigInt((m[2] ?? "").padEnd(6, "0")) : null;
};
const bn = (x: bigint) => new anchor.BN(x.toString());
const inputCls = "w-full min-h-[44px] rounded-md border-[0.5px] border-edge bg-surface p-3 text-sm text-fg focus:border-muted focus:outline-none";
const btnCls = "inline-flex items-center gap-2.5 rounded-md border-[0.5px] border-accent bg-accent px-4 py-[11px] text-[13px] font-medium text-canvas disabled:opacity-50";

/** Build → sign with the connected wallet → confirm → refresh server data (the indexer catches up within seconds). */
function useSend() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; msg?: string; sig?: string }>({ busy: false });
  const run = async (build: (p: sdk.Programs, me: PublicKey) => Promise<TransactionInstruction[]>) => {
    if (!wallet) return setState({ busy: false, msg: t.connect });
    setState({ busy: true, msg: t.submitting });
    try {
      const p = sdk.programs(new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" }));
      const tx = new Transaction().add(...(await build(p, wallet.publicKey)));
      tx.feePayer = wallet.publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      const sig = await connection.sendRawTransaction((await wallet.signTransaction(tx)).serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setState({ busy: false, msg: t.done, sig });
      router.refresh();
    } catch (e) {
      setState({ busy: false, msg: `${t.failed} ${(e as Error).message.slice(0, 160)}` });
    }
  };
  return { ...state, run };
}

function Status({ msg, sig }: { msg?: string; sig?: string }) {
  if (!msg) return null;
  return (
    <p role="status" className="text-[13px] text-muted">
      {msg}{" "}
      {sig && <a className="underline" href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noreferrer">{t.viewTx}</a>}
    </p>
  );
}

export function DepositForm({ vaultExists, minBond, mint, label, button }: {
  vaultExists: boolean; minBond: string; mint: string; label: string; button: string;
}) {
  const [amount, setAmount] = useState("");
  const [ack, setAck] = useState(false);
  const [err, alertMsg] = useState<string>();
  const s = useSend();
  const submit = () => {
    const a = parse(amount);
    if (!a || a <= 0n) return alertMsg(t.invalidAmount);
    if (!vaultExists && a < BigInt(minBond)) return alertMsg(t.belowMin);
    s.run(async (p, me) => vaultExists
      ? [await sdk.depositIx(p, me, new PublicKey(mint), bn(a))]
      : sdk.initVaultAndDepositIxs(p, me, new PublicKey(mint), bn(a)));
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-xs text-muted">
        {label}
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="500" />
      </label>
      <label className="flex items-start gap-2 text-[13px] text-fg">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-[3px] accent-accent" />
        {en.common.riskAck}
      </label>
      <div><button type="button" disabled={!ack || s.busy} onClick={submit} className={btnCls}>{button}</button></div>
      {err && <p role="alert" className="text-[13px] text-muted">{err}</p>}
      <Status msg={s.msg} sig={s.sig} />
    </div>
  );
}

export function WithdrawForm({ max, mint, label, button }: { max: string; mint: string; label: string; button: string }) {
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    const a = parse(amount);
    if (!a || a <= 0n) return setErr(t.invalidAmount);
    if (a > BigInt(max)) return setErr(t.overMax);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.withdrawIx(p, me, new PublicKey(mint), bn(a))]);
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-xs text-muted">
        {label}
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
      </label>
      <div><button type="button" disabled={s.busy} onClick={submit} className={btnCls}>{button}</button></div>
      {err && <p role="alert" className="text-[13px] text-muted">{err}</p>}
      <Status msg={s.msg} sig={s.sig} />
    </div>
  );
}

export function BackForm({ freelancerRef, max, label, button }: { freelancerRef: string; max: string; label: string; button: string }) {
  const [cap, setCap] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    const a = parse(cap);
    if (!a || a <= 0n) return setErr(t.invalidAmount);
    if (a > BigInt(max)) return setErr(t.overCapacity);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.createBackingIx(p, me, Buffer.from(freelancerRef, "hex"), bn(a))]);
  };
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-xs text-muted">
        {label}
        <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className={inputCls} />
      </label>
      <label className="flex items-start gap-2 text-[13px] text-fg">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-[3px] accent-accent" />
        {en.common.riskAck}
      </label>
      <div><button type="button" disabled={!ack || s.busy} onClick={submit} className={btnCls}>{button}</button></div>
      {err && <p role="alert" className="text-[13px] text-muted">{err}</p>}
      <Status msg={s.msg} sig={s.sig} />
    </div>
  );
}
