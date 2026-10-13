"use client";
// Voucher wallet actions (VO-1, VO-2, VO-4). Only rendered under /voucher (wallet layout, rule 1).
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Detail, Field } from "@/components/ui";
import { TxStatus, bn, parseUsd, useSend } from "@/components/wallet-tx";

const t = en.voucher.actions;
const USDC = 1_000_000n;
/** base units → "1,234.50" for inputs and readouts */
const plain = (v: bigint) => `${(v / USDC).toLocaleString("en-US")}.${((v % USDC) / 10_000n).toString().padStart(2, "0")}`;
const toInput = (v: bigint) => plain(v).replace(/,/g, "");

export function DepositForm({ vaultExists, minBond, mint, balance, label, button, afterLabel }: {
  vaultExists: boolean; minBond: string; mint: string; balance: string; label: string; button: string; afterLabel: string;
}) {
  const [amount, setAmount] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const a = parseUsd(amount);
  const submit = () => {
    if (!a) return setErr(t.invalidAmount);
    if (!vaultExists && a < BigInt(minBond)) return setErr(t.belowMin);
    setErr(undefined);
    s.run(async (p, me) => vaultExists
      ? [await sdk.depositIx(p, me, new PublicKey(mint), bn(a))]
      : sdk.initVaultAndDepositIxs(p, me, new PublicKey(mint), bn(a)));
  };
  return (
    <>
      <Field label={label} value={amount} onChange={(v) => { setAmount(v); setErr(undefined); }} inputMode="decimal" placeholder="500" error={err}
        action={{ label: en.common.max, onClick: () => setAmount(toInput(BigInt(balance))) }} />
      <Detail label={afterLabel} value={(a ?? 0n) <= BigInt(balance) ? `${plain(BigInt(balance) - (a ?? 0n))} USDC` : "—"} />
      <Check checked={ack} onChange={setAck}>{en.common.riskAck}</Check>
      <div><Button large primary icon="arrow-right" disabled={!ack || s.busy} onClick={submit}>{button}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}

export function WithdrawForm({ max, mint, label, button }: { max: string; mint: string; label: string; button: string }) {
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    const a = parseUsd(amount);
    if (!a) return setErr(t.invalidAmount);
    if (a > BigInt(max)) return setErr(t.overMax);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.withdrawIx(p, me, new PublicKey(mint), bn(a))]);
  };
  return (
    <>
      <Field label={label} value={amount} onChange={(v) => { setAmount(v); setErr(undefined); }} inputMode="decimal" placeholder="0.00" error={err}
        action={{ label: en.common.max, onClick: () => setAmount(toInput(BigInt(max))) }} />
      <Button disabled={s.busy} onClick={submit}>{button}</Button>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}

export function BackForm({ freelancerRef, max, label, button, afterLabel }: { freelancerRef: string; max: string; label: string; button: string; afterLabel: string }) {
  const [cap, setCap] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const a = parseUsd(cap);
  const room = BigInt(max);
  const presets = [250n, 500n, 1000n].map((n) => n * USDC).filter((n) => n < room);
  const submit = () => {
    if (!a) return setErr(t.invalidAmount);
    if (a > room) return setErr(t.overCapacity);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.createBackingIx(p, me, Buffer.from(freelancerRef, "hex"), bn(a))]);
  };
  return (
    <>
      <div className="flex flex-col gap-2">
        <Field label={label} prefix="$" value={cap} onChange={(v) => { setCap(v); setErr(undefined); }} inputMode="decimal" placeholder="500" error={err}
          action={{ label: en.common.max, onClick: () => setCap(toInput(room)) }} />
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button key={p.toString()} type="button" onClick={() => setCap(toInput(p))}
                className="h-7 rounded-md bg-raised px-2.5 font-mono text-[11px] text-fg shadow-[inset_0_0_0_0.5px_theme(colors.line)] hover:text-bright">
                {`$${(p / USDC).toLocaleString("en-US")}`}
              </button>
            ))}
          </div>
        )}
      </div>
      <Detail label={afterLabel} value={(a ?? 0n) <= room ? `$${plain(room - (a ?? 0n))}` : "—"} />
      <Check checked={ack} onChange={setAck}>{en.common.riskAck}</Check>
      <Button large primary icon="arrow-right" disabled={!ack || s.busy} onClick={submit}>{button}</Button>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}
