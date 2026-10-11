"use client";
// Panelist + admin wallet actions (PA-1, AD-1). Only under /panel and /admin (wallet layouts, rule 1).
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Field } from "@/components/ui";
import { TxStatus, useSend } from "@/components/wallet-tx";

const t = en.disputes;
const load = (p: sdk.Programs, commitment: string) => sdk.loadCommitment(p, new PublicKey(commitment));

/** PA-1: two options (OQ-3). The program rejects a second vote and non-panel wallets. */
export function VoteForm({ commitment, index }: { commitment: string; index: number }) {
  const [vote, setVote] = useState<"upheld" | "rejected" | "">("");
  const [ack, setAck] = useState(false);
  const s = useSend();
  return (
    <>
      <Field label={t.ruling} value={vote} onChange={(v) => setVote(v as typeof vote)}
        options={[["", t.choose], ["upheld", t.upheld], ["rejected", t.rejected]]} />
      <Check checked={ack} onChange={setAck}>{t.voteAck}</Check>
      <div>
        <Button primary icon="arrow-right" disabled={!vote || !ack || s.busy}
          onClick={() => s.run(async (p, me) => [await sdk.castVoteIx(p, await load(p, commitment), index, me, sdk.VOTE[vote as "upheld" | "rejected"])])}>
          {t.submitVote}
        </Button>
      </div>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}

/** Permissionless once a majority exists or the ruling deadline passed. */
export function FinalizeButton({ commitment, index }: { commitment: string; index: number }) {
  const s = useSend();
  return (
    <>
      <div><Button disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.finalizeClaimIx(p, await load(p, commitment), index)])}>{t.finalize}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}

/** AD-1: pick three active panelists for a filed claim. */
export function AssignPanelForm({ commitment, index, panelists }: { commitment: string; index: number; panelists: { wallet: string; name: string }[] }) {
  const [picks, setPicks] = useState(["", "", ""]);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const options: [string, string][] = [["", t.choose], ...panelists.map((x) => [x.wallet, x.name] as [string, string])];
  const submit = () => {
    if (new Set(picks).size !== 3 || picks.includes("")) return setErr(t.threeDistinct);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.assignPanelIx(p, await load(p, commitment), index, me, picks.map((w) => new PublicKey(w)))]);
  };
  return (
    <>
      <div className="flex flex-wrap gap-4">
        {picks.map((v, i) => (
          <Field key={i} label={`${t.panelist} ${i + 1}`} value={v} onChange={(x) => setPicks(picks.map((y, j) => (j === i ? x : y)))} options={options} />
        ))}
      </div>
      <div><Button primary icon="arrow-right" disabled={s.busy} onClick={submit}>{t.assign}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}

export function PauseToggle({ program, paused }: { program: "bond" | "escrow" | "disputes"; paused: boolean }) {
  const s = useSend();
  return (
    <>
      <div><Button disabled={s.busy} onClick={() => s.run(async (p, me) => [await sdk.setPausedIx(p, program, me, !paused)])}>{paused ? t.unpause : t.pause}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}

export function SetOracleForm({ current }: { current: string }) {
  const [oracle, setOracle] = useState(current);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    try {
      const key = new PublicKey(oracle.trim());
      setErr(undefined);
      s.run(async (p, me) => [await sdk.setOracleIx(p, me, key)]);
    } catch {
      setErr(t.badKey);
    }
  };
  return (
    <>
      <Field label={t.oracle} value={oracle} onChange={setOracle} />
      <div><Button disabled={s.busy} onClick={submit}>{t.setOracle}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}

/** Adds the panelist on-chain, then records the name (and grants the panelist role to that email's account). */
export function AddPanelistForm() {
  const [wallet, setWallet] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    let key: PublicKey;
    try {
      key = new PublicKey(wallet.trim());
    } catch {
      return setErr(t.badKey);
    }
    if (!name.trim()) return setErr(t.nameRequired);
    setErr(undefined);
    s.run(async (p, me) => [await sdk.addPanelistIx(p, me, key)], async () => {
      const r = await fetch("/api/admin/panelists", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet: key.toBase58(), name, email }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
    });
  };
  return (
    <>
      <Field label={t.panelistWallet} value={wallet} onChange={setWallet} />
      <div className="flex flex-wrap gap-4">
        <Field label={t.panelistName} value={name} onChange={setName} />
        <Field label={t.panelistEmail} value={email} onChange={setEmail} placeholder="name@example.com" />
      </div>
      <div><Button primary disabled={s.busy} onClick={submit}>{t.addPanelist}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}

export function PanelistActiveToggle({ wallet, active }: { wallet: string; active: boolean }) {
  const s = useSend();
  return (
    <>
      <Button disabled={s.busy} onClick={() => s.run(async (p, me) => [await sdk.setPanelistActiveIx(p, me, new PublicKey(wallet), !active)])}>
        {active ? t.deactivate : t.activate}
      </Button>
      <TxStatus msg={s.msg} sig={s.sig} />
    </>
  );
}

/** OQ-6: any address can be the treasury (E-54). */
export function SetTreasuryForm({ program, current, mint }: { program: "escrow" | "disputes"; current: string; mint: string }) {
  const [treasury, setTreasury] = useState(current);
  const [err, setErr] = useState<string>();
  const s = useSend();
  const submit = () => {
    try {
      const key = new PublicKey(treasury.trim());
      setErr(undefined);
      s.run(async (p, me) => sdk.setTreasuryIxs(p, program, me, key, new PublicKey(mint)));
    } catch {
      setErr(t.badKey);
    }
  };
  return (
    <>
      <Field label={`${t.treasury} · ${program}`} value={treasury} onChange={setTreasury} />
      <div><Button disabled={s.busy} onClick={submit}>{t.setTreasury}</Button></div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}
