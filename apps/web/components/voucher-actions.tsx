"use client";
// Voucher wallet actions (VO-1, VO-2, VO-4). Only rendered under /voucher (wallet layout, rule 1).
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Field } from "@/components/ui";
import { TxStatus, bn, parseUsd, useSend } from "@/components/wallet-tx";

const t = en.voucher.actions;

export function DepositForm({ vaultExists, minBond, mint, label, button }: {
  vaultExists: boolean; minBond: string; mint: string; label: string; button: string;
}) {
  const [amount, setAmount] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    const a = parseUsd(amount);
    if (!a) return setErr(t.invalidAmount);
    if (!vaultExists && a < BigInt(minBond)) return setErr(t.belowMin);
    setErr(undefined);
    s.run(async (p, me) => vaultExists
      ? [await sdk.depositIx(p, me, new PublicKey(mint), bn(a))]
      : sdk.initVaultAndDepositIxs(p, me, new PublicKey(mint), bn(a)));
  };
  return (
    <>
      <Field label={label} value={amount} onChange={setAmount} inputMode="decimal" placeholder="500" />
      <Check checked={ack} onChange={setAck}>{en.common.riskAck}</Check>
      <div><Button primary icon="arrow-right" disabled={!ack || s.busy} onClick={submit}>{button}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
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
      <Field label={label} value={amount} onChange={setAmount} inputMode="decimal" />
      <div><Button disabled={s.busy} onClick={submit}>{button}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}

export function BackForm({ freelancerRef, max, label, button }: { freelancerRef: string; max: string; label: string; button: string }) {
  const [cap, setCap] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    const a = parseUsd(cap);
    if (!a) return setErr(t.invalidAmount);
    if (a > BigInt(max)) return setErr(t.overCapacity);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.createBackingIx(p, me, Buffer.from(freelancerRef, "hex"), bn(a))]);
  };
  return (
    <>
      <Field label={label} value={cap} onChange={setCap} inputMode="decimal" />
      <Check checked={ack} onChange={setAck}>{en.common.riskAck}</Check>
      <div><Button primary icon="arrow-right" disabled={!ack || s.busy} onClick={submit}>{button}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}
