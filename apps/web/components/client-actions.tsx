"use client";
// Client wallet actions (CL-1..CL-5). Only rendered under /client (wallet layout, rule 1).
// Salary always releases to the registered partner (rule 3); the program enforces it.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Detail, Divider, Field, Notice, Panel, Steps } from "@/components/ui";
import { TxStatus, bn, parseUsd, useSend } from "@/components/wallet-tx";

const t = en.client.actions;
const USDC = 1_000_000n;
const fmtUsd = (v: bigint) => `$${(v / USDC).toLocaleString("en-US")}.${((v % USDC) / 10_000n).toString().padStart(2, "0")}`;
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export type FreelancerOption = {
  ref: string; name: string;
  backings: { vault: string; backing: string; voucherName: string; cap: string; locked: string }[];
};
type Rules = { premiumBps: number; feeBps: number; shareBps: number; mint: string; partner: string };
type MilestoneDraft = { amount: string; due: string; spec: string; mode: "client" | "github"; repo: string; pr: string };

const blank = (): MilestoneDraft => ({ amount: "", due: "", spec: "", mode: "client", repo: "", pr: "" });

/** CL-1/CL-2/CL-4 wizard: freelancer → milestones → vest → review → create & fund (one wallet prompt). */
export function NewCommitmentWizard({ freelancers, preselect, rules }: { freelancers: FreelancerOption[]; preselect?: string; rules: Rules }) {
  const w = en.client.new;
  const router = useRouter();
  const s = useSend();
  const [step, setStep] = useState(preselect ? 2 : 1);
  const [ref, setRef] = useState(preselect ?? freelancers[0]?.ref ?? "");
  const [ms, setMs] = useState<MilestoneDraft[]>([blank()]);
  const [vest, setVest] = useState("");
  const [vestDays, setVestDays] = useState("30");
  const [share, setShare] = useState(false);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const created = useRef("");

  const f = freelancers.find((x) => x.ref === ref);
  // up to 4 backings (on-chain limit), largest free capacity first
  const backings = (f?.backings ?? []).filter((b) => BigInt(b.cap) > BigInt(b.locked))
    .sort((a, b) => Number(BigInt(b.cap) - BigInt(b.locked) - (BigInt(a.cap) - BigInt(a.locked)))).slice(0, 4);
  const cover = backings.reduce((a, b) => a + BigInt(b.cap) - BigInt(b.locked), 0n);
  const amounts = ms.map((m) => parseUsd(m.amount) ?? 0n);
  const shareBps = share ? rules.shareBps : 0;
  const splits = amounts.map((a) => sdk.clientDue(a, rules.premiumBps, rules.feeBps, shareBps));
  const salary = amounts.reduce((a, b) => a + b, 0n);
  const premium = splits.reduce((a, x) => a + x.premium, 0n);
  const fee = splits.reduce((a, x) => a + x.fee, 0n);
  const vestAmt = parseUsd(vest || "0") ?? 0n;
  const total = splits.reduce((a, x) => a + x.clientDue, 0n) + vestAmt;
  const set = (i: number, k: keyof MilestoneDraft, v: string) => setMs(ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));

  const validMilestones = () => {
    for (const [i, m] of ms.entries()) {
      if (!parseUsd(m.amount)) return fill(t.errAmount, { n: i + 1 });
      if (!m.due || Date.parse(m.due) <= Date.now()) return fill(t.errDue, { n: i + 1 });
      if (m.spec.trim().length < 10) return fill(t.errSpec, { n: i + 1 });
      if (m.mode === "github" && (!/^[\w.-]+\/[\w.-]+$/.test(m.repo.trim()) || !/^\d+$/.test(m.pr))) return fill(t.errGithub, { n: i + 1 });
    }
    return undefined;
  };
  const next = () => {
    const e = step === 1 ? (!f || !backings.length ? t.errNoBacking : undefined) : step === 2 ? validMilestones() : step === 3 && vest && !parseUsd(vest) ? t.errVest : undefined;
    setErr(e);
    if (!e) setStep(step + 1);
  };

  const create = () => s.run(async (p, me) => {
    const id = BigInt(Date.now()); // unique per client; part of the commitment PDA
    const { commitment, groups } = await sdk.createCommitmentIxGroups(p, {
      client: me, id, freelancerRef: Buffer.from(ref, "hex"), partner: new PublicKey(rules.partner), mint: new PublicKey(rules.mint),
      backings: backings.map((b) => ({ vault: new PublicKey(b.vault), backing: new PublicKey(b.backing) })),
      share, vestAmount: bn(vestAmt), vestDelaySecs: Number(vestDays || 0) * 86_400, fundAmount: bn(total),
      milestones: ms.map((m) => ({
        amount: bn(parseUsd(m.amount)!), dueTs: Math.floor(Date.parse(`${m.due}T23:59:59Z`) / 1000), specHash: sdk.specHash(m.spec),
        githubRef: m.mode === "github" ? { repo: m.repo.trim().toLowerCase(), pr: Number(m.pr) } : undefined,
      })),
    });
    created.current = commitment.toBase58();
    return groups;
  }, async () => {
    await fetch("/api/commitments/meta", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commitment: created.current,
        specs: ms.map((m, index) => ({ index, markdown: m.spec })),
        github: ms.flatMap((m, index) => (m.mode === "github" ? [{ index, repo: m.repo.trim().toLowerCase(), pr: Number(m.pr) }] : [])),
      }),
    });
    router.push(`/client/commitments/${created.current}`);
  });

  return (
    <>
      <Steps steps={w.steps} current={step} horizontal />
      {step === 1 && (
        <Panel title={w.details} badge={w.selected}>
          {freelancers.length === 0 ? <p className="text-[13px] text-muted">{t.noFreelancers}</p> : (
            <Field label={w.fields.freelancer} value={ref} onChange={setRef} options={freelancers.map((x) => [x.ref, x.name])} />
          )}
          {backings.map((b) => (
            <Detail key={b.backing} label={fill(t.backedBy, { name: b.voucherName })} value={`${fmtUsd(BigInt(b.cap) - BigInt(b.locked))} / ${fmtUsd(BigInt(b.cap))}`} />
          ))}
          <Detail label={w.fields.cap} value={fmtUsd(cover)} />
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">{w.fields.partner}</p>
            <p className="text-sm text-fg">{w.partnerValue}</p>
          </div>
          <Notice title={w.relatedNotice.title}>{w.relatedNotice.body}</Notice>
        </Panel>
      )}
      {step === 2 && (
        <Panel title={w.milestones} badge={fill(t.stepOf, { n: 2 })}>
          <p className="text-xs text-muted">{fill(w.milestonesBody, { cap: fmtUsd(cover) })}</p>
          {ms.map((m, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md border-[0.5px] border-line bg-surface p-4">
              <p className="text-sm font-medium text-white">{fill(t.milestoneN, { n: i + 1 })}</p>
              <div className="flex flex-wrap gap-4">
                <Field label={w.amount} value={m.amount} onChange={(v) => set(i, "amount", v)} inputMode="decimal" placeholder="1000" />
                <Field label={t.dueDate} value={m.due} onChange={(v) => set(i, "due", v)} type="date" />
              </div>
              <Field label={t.spec} value={m.spec} onChange={(v) => set(i, "spec", v)} rows={4} placeholder={t.specPlaceholder} />
              <Field label={w.fields.mode} value={m.mode} onChange={(v) => set(i, "mode", v)}
                options={[["client", t.modeClient], ["github", t.modeGithub]]} />
              {m.mode === "github" && (
                <div className="flex flex-wrap gap-4">
                  <Field label={t.repo} value={m.repo} onChange={(v) => set(i, "repo", v)} placeholder="owner/repo" />
                  <Field label={t.pr} value={m.pr} onChange={(v) => set(i, "pr", v)} inputMode="numeric" placeholder="42" />
                </div>
              )}
              {ms.length > 1 && <div><Button onClick={() => setMs(ms.filter((_, j) => j !== i))}>{t.remove}</Button></div>}
            </div>
          ))}
          {ms.length < 12 && <div><Button onClick={() => setMs([...ms, blank()])}>{t.addMilestone}</Button></div>}
        </Panel>
      )}
      {step === 3 && (
        <Panel title={w.steps[2]} badge={fill(t.stepOf, { n: 3 })}>
          <p className="text-[13px] text-muted">{t.vestBody}</p>
          <div className="flex flex-wrap gap-4">
            <Field label={w.totals.vest} value={vest} onChange={setVest} inputMode="decimal" placeholder="0" />
            <Field label={t.vestDays} value={vestDays} onChange={setVestDays} inputMode="numeric" />
          </div>
          <Check checked={share} onChange={setShare}>{fill(t.share, { pct: rules.shareBps / 100 })}</Check>
        </Panel>
      )}
      {step >= 4 && (
        <Panel title={w.steps[3]} badge={fill(t.stepOf, { n: step })}>
          <Detail label={w.fields.freelancer} value={f?.name} />
          <Detail label={w.totals.salary} value={fmtUsd(salary)} />
          <Detail label={`${w.totals.premium} · ${rules.premiumBps / 100}%`} value={fmtUsd(premium)} />
          <Detail label={`${w.totals.fee} · ${rules.feeBps / 100}%`} value={fmtUsd(fee)} />
          {share && <Detail label={t.freelancerShare} value={`−${fmtUsd(splits.reduce((a, x) => a + x.freelancerPart, 0n))}`} />}
          <Detail label={w.totals.vest} value={fmtUsd(vestAmt)} />
          <Divider />
          <Detail label={w.totals.fund} value={fmtUsd(total)} />
          <p className="text-xs text-muted">{w.payNote}</p>
          <Check checked={ack} onChange={setAck}>{t.ack}</Check>
          <div><Button primary icon="arrow-right" disabled={!ack || s.busy} onClick={() => { setStep(5); create(); }}>{fill(t.createFund, { total: fmtUsd(total) })}</Button></div>
        </Panel>
      )}
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
      <div className="flex justify-between">
        {step > 1 && step < 5 ? <Button onClick={() => setStep(step - 1)}>{en.common.back}</Button> : <span />}
        {step < 4 && <Button primary icon="arrow-right" onClick={next}>{t.continue}</Button>}
      </div>
    </>
  );
}

type Ctx = { address: string; fundGap: string; nextIndex: number | null; activeIndex: number | null; canCancel: boolean; claimable: number | null };

/** CL-2/CL-3/CL-5 on the timeline: fund the gap, activate next, approve active, file a claim, cancel between milestones. */
export function CommitmentActions({ ctx, mint }: { ctx: Ctx; mint: string }) {
  const s = useSend();
  const [statement, setStatement] = useState("");
  const [err, setErr] = useState<string>();
  const key = new PublicKey(ctx.address);
  const load = (p: sdk.Programs) => sdk.loadCommitment(p, key);

  const fileClaim = async () => {
    setErr(undefined);
    const r = await fetch("/api/claims/evidence", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ commitment: ctx.address, index: ctx.claimable, statement }),
    });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    s.run(async (p) => [await sdk.fileClaimIx(p, await load(p), ctx.claimable!, Buffer.from(j.evidenceHash, "hex"))]);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {BigInt(ctx.fundGap) > 0n && (
          <Button primary disabled={s.busy} onClick={() => s.run(async (p, me) => [await sdk.fundIx(p, me, key, new PublicKey(mint), bn(BigInt(ctx.fundGap)))])}>
            {fill(t.fund, { amount: fmtUsd(BigInt(ctx.fundGap)) })}
          </Button>
        )}
        {ctx.nextIndex !== null && BigInt(ctx.fundGap) === 0n && (
          <Button primary disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.activateMilestoneIx(p, await load(p), ctx.nextIndex!)])}>
            {fill(t.activate, { n: ctx.nextIndex + 1 })}
          </Button>
        )}
        {ctx.activeIndex !== null && (
          <Button primary icon="arrow-right" disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.approveMilestoneIx(p, await load(p), ctx.activeIndex!)])}>
            {fill(en.client.commitment.approve, { milestone: `M${ctx.activeIndex + 1}` })}
          </Button>
        )}
        {ctx.canCancel && (
          <Button disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.cancelCommitmentIx(p, await load(p))])}>{t.cancel}</Button>
        )}
      </div>
      {ctx.claimable !== null && (
        <>
          <Divider />
          <Field label={fill(t.claimStatement, { n: ctx.claimable + 1 })} value={statement} onChange={setStatement} rows={4} placeholder={t.claimPlaceholder} />
          <div><Button disabled={s.busy || statement.trim().length < 20} onClick={fileClaim}>{en.client.commitment.fileClaim}</Button></div>
        </>
      )}
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
    </>
  );
}
