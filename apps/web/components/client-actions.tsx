"use client";
// Client wallet actions (CL-1..CL-5). Only rendered under /client (wallet layout, rule 1).
// Salary always releases to the registered partner (rule 3); the program enforces it.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import * as sdk from "@insuwork/sdk";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Detail, Divider, Field, FieldRow, Notice, Panel, RadioCards, Segmented, Split, Steps } from "@/components/ui";
import { TxStatus, bn, parseUsd, useSend } from "@/components/wallet-tx";
import type { PlannedMilestone } from "@insuwork/triage";
import { blankMilestone, milestoneProblem, specMarkdown, type MilestoneDraft, type Problem } from "@/lib/spec";

const t = en.client.actions;
const USDC = 1_000_000n;
const fmtUsd = (v: bigint) => `$${(v / USDC).toLocaleString("en-US")}.${((v % USDC) / 10_000n).toString().padStart(2, "0")}`;
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const fmtDate = (iso: string) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

export type FreelancerOption = {
  ref: string; name: string;
  backings: { vault: string; backing: string; voucherName: string; cap: string; locked: string }[];
};
export type ProjectSeed = { id: string; title: string; brief: string; budget: string | null; plan: PlannedMilestone[] };
type Rules = { premiumBps: number; feeBps: number; shareBps: number; mint: string; partner: string };

/** up to 4 backings (on-chain limit), largest free capacity first */
const openBackings = (f?: FreelancerOption) => (f?.backings ?? []).filter((b) => BigInt(b.cap) > BigInt(b.locked))
  .sort((a, b) => Number(BigInt(b.cap) - BigInt(b.locked) - (BigInt(a.cap) - BigInt(a.locked)))).slice(0, 4);
const freeOf = (f?: FreelancerOption) => openBackings(f).reduce((a, b) => a + BigInt(b.cap) - BigInt(b.locked), 0n);
const fromPlan = (m: PlannedMilestone): MilestoneDraft =>
  ({ ...blankMilestone(), title: m.title, deliverables: m.deliverables, acceptance: m.acceptance, amount: String(m.amountUsd), due: m.due });
const PROBLEM: Record<Problem, string> = {
  title: t.errTitle, amount: t.errAmount, due: t.errDue, order: t.errOrder, deliverables: t.errDeliverables, acceptance: t.errAcceptance, github: t.errGithub,
};

/**
 * CL-1/CL-2/CL-4 wizard (E-59): project context → freelancer → milestones (deliverables + acceptance, optional AI draft)
 * → vest → review → create & fund (one wallet prompt). Each milestone's spec carries the project context. Live funding summary aside.
 */
export function NewCommitmentWizard({ freelancers, preselect, rules, project }: {
  freelancers: FreelancerOption[]; preselect?: string; rules: Rules; project?: ProjectSeed;
}) {
  const w = en.client.new;
  const router = useRouter();
  const s = useSend();
  const [step, setStep] = useState(project && preselect ? 3 : 1);
  const [title, setTitle] = useState(project?.title ?? "");
  const [brief, setBrief] = useState(project?.brief ?? "");
  const [budget, setBudget] = useState(project?.budget ? String(BigInt(project.budget) / USDC) : "");
  const [ref, setRef] = useState(preselect ?? freelancers.find((x) => freeOf(x) > 0n)?.ref ?? "");
  const [ms, setMs] = useState<MilestoneDraft[]>(project?.plan.length ? project.plan.map(fromPlan) : [blankMilestone()]);
  const [vest, setVest] = useState("");
  const [vestDays, setVestDays] = useState("30");
  const [share, setShare] = useState(false);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string>();
  const [tried, setTried] = useState(false);
  const [ai, setAi] = useState<{ busy?: boolean; error?: string }>({});
  const created = useRef("");

  const f = freelancers.find((x) => x.ref === ref);
  const backings = openBackings(f);
  const cover = freeOf(f);
  const amounts = ms.map((m) => parseUsd(m.amount) ?? 0n);
  const shareBps = share ? rules.shareBps : 0;
  const splits = amounts.map((a) => sdk.clientDue(a, rules.premiumBps, rules.feeBps, shareBps));
  const salary = amounts.reduce((a, b) => a + b, 0n);
  const premium = splits.reduce((a, x) => a + x.premium, 0n);
  const fee = splits.reduce((a, x) => a + x.fee, 0n);
  const vestAmt = parseUsd(vest || "0") ?? 0n;
  const total = splits.reduce((a, x) => a + x.clientDue, 0n) + vestAmt;
  const set = (i: number, k: keyof MilestoneDraft, v: string) => setMs(ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const projectOk = title.trim().length >= 3 && brief.trim().length >= 20;
  const errs = ms.map((_, i) => {
    const p = milestoneProblem(ms, i);
    return p ? fill(PROBLEM[p], { n: i + 1, prev: i }) : undefined;
  });
  const go = (n: number) => { setErr(undefined); setTried(false); setStep(n); };
  const next = () => {
    const e = step === 1 ? (projectOk ? undefined : t.errProject)
      : step === 2 ? (!f || !backings.length ? t.errNoBacking : undefined)
      : step === 3 ? errs.find(Boolean)
      : step === 4 && vest && !parseUsd(vest) ? t.errVest : undefined;
    setTried(true);
    setErr(step === 1 || step === 3 ? undefined : e); // shown inline on those steps
    if (!e) go(step + 1);
  };

  const draftWithAi = async () => {
    if (!projectOk) return setAi({ error: t.aiNeedsBrief });
    setAi({ busy: true });
    const usdBudget = parseUsd(budget);
    const r = await fetch("/api/projects/plan", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, brief, budgetUsd: usdBudget ? Number(usdBudget / USDC) : null }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setAi({ error: fill(t.aiFailed, { error: j.error ?? r.statusText }) });
    setMs((j.plan as PlannedMilestone[]).map(fromPlan));
    setTried(false);
    setAi({});
  };

  const specs = ms.map((m, i) => specMarkdown({ title, brief }, m, i, ms.length));
  const create = () => s.run(async (p, me) => {
    // fund (last tx) needs the client's test-USDC account; check first so create can't land unfunded
    const conn = p.escrow.provider.connection, clientAta = sdk.ata(me, new PublicKey(rules.mint));
    const have = (await conn.getAccountInfo(clientAta)) ? BigInt((await conn.getTokenAccountBalance(clientAta)).value.amount) : 0n;
    if (have < total) throw new Error(fill(t.errFunds, { need: fmtUsd(total), have: fmtUsd(have) }));
    const id = BigInt(Date.now()); // unique per client; part of the commitment PDA
    const { commitment, groups } = await sdk.createCommitmentIxGroups(p, {
      client: me, id, freelancerRef: Buffer.from(ref, "hex"), partner: new PublicKey(rules.partner), mint: new PublicKey(rules.mint),
      backings: backings.map((b) => ({ vault: new PublicKey(b.vault), backing: new PublicKey(b.backing) })),
      share, vestAmount: bn(vestAmt), vestDelaySecs: Number(vestDays || 0) * 86_400, fundAmount: bn(total),
      milestones: ms.map((m, i) => ({
        amount: bn(parseUsd(m.amount)!), dueTs: Math.floor(Date.parse(`${m.due}T23:59:59Z`) / 1000), specHash: sdk.specHash(specs[i]),
        githubRef: m.mode === "github" ? { repo: m.repo.trim().toLowerCase(), pr: Number(m.pr) } : undefined,
      })),
    });
    created.current = commitment.toBase58();
    return groups;
  }, async () => {
    // specs + GitHub links live off-chain; the webhook can't release M-n without its link, so this must succeed
    const body = JSON.stringify({
      commitment: created.current, project: project?.id,
      specs: specs.map((markdown, index) => ({ index, markdown })),
      github: ms.flatMap((m, index) => (m.mode === "github" ? [{ index, repo: m.repo.trim().toLowerCase(), pr: Number(m.pr) }] : [])),
    });
    let r: Response | null = null;
    for (let i = 0; i < 5 && !r?.ok; i++) {
      if (i) await new Promise((res) => setTimeout(res, 1500 * i));
      r = await fetch("/api/commitments/meta", { method: "POST", headers: { "content-type": "application/json" }, body });
    }
    if (!r?.ok) throw new Error(`${t.metaFailed} ${(await r?.json().catch(() => ({})))?.error ?? ""}`);
    router.push(`/client/commitments/${created.current}`);
  });

  const summary = (
    <Panel side="action" title={w.funding} action={<span className="font-mono text-[11px] text-muted">{w.live}</span>}>
      <Detail label={w.projectTitle} value={<span className="font-sans text-[13px]">{title.trim() || "—"}</span>} />
      <Detail label={w.fields.freelancer} value={<span className="font-sans text-[13px]">{f?.name ?? "—"}</span>} />
      <Detail label={w.totals.salary} value={fmtUsd(salary)} />
      <Detail label={`${w.totals.premium} · ${rules.premiumBps / 100}%`} value={fmtUsd(premium)} />
      <Detail label={`${w.totals.fee} · ${rules.feeBps / 100}%`} value={fmtUsd(fee)} />
      {share && <Detail label={t.freelancerShare} value={`−${fmtUsd(splits.reduce((a, x) => a + x.freelancerPart, 0n))}`} />}
      <Detail label={w.totals.vest} value={fmtUsd(vestAmt)} />
      <Divider />
      <Detail strong label={w.totalToFund} value={fmtUsd(total)} />
      <p className="text-xs leading-normal text-faint">{w.payNote}</p>
    </Panel>
  );

  return (
    <>
      <Steps steps={w.steps} current={step} horizontal />
      <Split sticky side={summary}>
        {step === 1 && (
          <Panel title={w.project}>
            <p className="text-[13px] leading-[1.55] text-muted">{w.projectBody}</p>
            {project && <Notice title={w.fromProject} />}
            <Field label={w.projectTitle} value={title} onChange={setTitle} maxLength={120} placeholder={en.client.projects.placeholders.title}
              error={tried && title.trim().length < 3 ? t.errProject : undefined} />
            <Field label={w.projectBrief} value={brief} onChange={setBrief} rows={5} maxLength={4000} placeholder={w.projectBriefPlaceholder}
              hint={`${brief.trim().length} / 20+`} error={tried && brief.trim().length < 20 ? t.errProject : undefined} />
            <Field label={w.budget} value={budget} onChange={setBudget} prefix="$" inputMode="decimal" placeholder="1500" />
          </Panel>
        )}
        {step === 2 && (
          <Panel title={w.choose}>
            {freelancers.length === 0 ? <p className="text-[13px] text-muted">{t.noFreelancers}</p> : (
              <RadioCards label={w.fields.freelancer} value={ref} onChange={(v) => { setRef(v); setErr(undefined); }}
                options={freelancers.map((x) => {
                  const free = freeOf(x);
                  return {
                    value: x.ref, title: x.name, disabled: free === 0n,
                    body: fill(w.backedBy, { name: x.backings.map((b) => b.voucherName).join(", ") }),
                    aside: free === 0n ? en.client.freelancers.fullyCommitted : fill(en.client.freelancers.free, { amount: fmtUsd(free) }),
                  };
                })} />
            )}
            {backings.length > 1 && backings.map((b) => (
              <Detail key={b.backing} label={fill(t.backedBy, { name: b.voucherName })} value={`${fmtUsd(BigInt(b.cap) - BigInt(b.locked))} / ${fmtUsd(BigInt(b.cap))}`} />
            ))}
            <Detail label={w.fields.partner} value={w.partnerValue} />
            <Notice title={w.relatedNotice.title}>{w.relatedNotice.body}</Notice>
          </Panel>
        )}
        {step === 3 && (
          <Panel title={w.milestones} action={<span className="font-mono text-[11px] text-muted">{fill(w.count, { n: ms.length })}</span>}>
            <p className="text-[13px] leading-[1.55] text-muted">{fill(w.milestonesBody, { cap: fmtUsd(cover) })}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] bg-canvas p-3 shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
              <Button disabled={ai.busy} onClick={draftWithAi}>{ai.busy ? t.aiDrafting : t.aiDraft}</Button>
              <span className="min-w-0 flex-[1_1_14rem] text-xs leading-normal text-faint">{t.aiReplaces}</span>
              {ai.error && <p role="alert" className="w-full text-xs text-danger">{ai.error}</p>}
            </div>
            {ms.map((m, i) => {
              const bad = tried && errs[i];
              const a = amounts[i];
              const pct = salary > 0n ? Number((a * 100n) / salary) : 0;
              return (
                <fieldset key={i} className={`flex min-w-0 flex-col gap-3.5 rounded-[10px] border-[0.5px] bg-canvas p-4 ${bad ? "border-danger" : "border-line"}`}>
                  <legend className="-ml-1.5 px-1.5 text-[13px] font-medium text-bright">
                    {fill(t.milestoneN, { n: i + 1 })}
                    {a > 0n && <span className="ml-2 font-mono text-[11px] font-normal text-faint">{fill(t.ofSalary, { pct })}</span>}
                  </legend>
                  <Field label={t.msTitle} value={m.title} onChange={(v) => set(i, "title", v)} maxLength={120} placeholder={t.msTitlePlaceholder} />
                  <FieldRow>
                    <Field label={w.amount} prefix="$" value={m.amount} onChange={(v) => set(i, "amount", v)} inputMode="decimal" placeholder="1000" />
                    <Field label={t.dueDate} value={m.due} onChange={(v) => set(i, "due", v)} type="date" />
                  </FieldRow>
                  <FieldRow min="15rem">
                    <Field label={t.deliverables} value={m.deliverables} onChange={(v) => set(i, "deliverables", v)} rows={3} placeholder={t.deliverablesPlaceholder} />
                    <Field label={t.acceptance} value={m.acceptance} onChange={(v) => set(i, "acceptance", v)} rows={3} placeholder={t.acceptancePlaceholder} />
                  </FieldRow>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-muted">{w.fields.mode}</span>
                    <Segmented label={w.fields.mode} value={m.mode} onChange={(v) => set(i, "mode", v)}
                      options={[["client", t.modeClient], ["github", t.modeGithub]]} />
                  </div>
                  {m.mode === "github" && (
                    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3.5">
                      <Field label={t.repo} value={m.repo} onChange={(v) => set(i, "repo", v)} placeholder="owner/repo" mono />
                      <Field label={t.pr} value={m.pr} onChange={(v) => set(i, "pr", v)} inputMode="numeric" placeholder="42" mono />
                    </div>
                  )}
                  {cover > 0n && a > cover && <p className="text-xs text-[#e8b84a]">{fill(w.capWarn, { cap: fmtUsd(cover) })}</p>}
                  {bad && <p role="alert" className="text-xs text-danger">{bad}</p>}
                  {ms.length > 1 && (
                    <button type="button" onClick={() => setMs(ms.filter((_, j) => j !== i))} className="self-start text-xs text-muted hover:text-danger">{t.remove}</button>
                  )}
                </fieldset>
              );
            })}
            {ms.length < 12 && (
              <button type="button" onClick={() => setMs([...ms, blankMilestone()])}
                className="min-h-11 rounded-[10px] border-[0.5px] border-dashed border-edge text-[13px] text-fg transition-colors hover:bg-[#0c0d0e] hover:text-bright">
                + {t.addMilestone}
              </button>
            )}
          </Panel>
        )}
        {step === 4 && (
          <Panel title={w.steps[3]} badge={w.optional}>
            <p className="text-[13px] leading-[1.55] text-muted">{t.vestBody}</p>
            <FieldRow>
              <Field label={w.totals.vest} prefix="$" value={vest} onChange={(v) => { setVest(v); setErr(undefined); }} inputMode="decimal" placeholder="0"
                error={tried && vest && !parseUsd(vest) ? t.errVest : undefined} />
              <Field label={t.vestDays} value={vestDays} onChange={(v) => setVestDays(v.replace(/\D/g, ""))} inputMode="numeric" mono />
            </FieldRow>
            <Check checked={share} onChange={setShare}>{fill(t.share, { pct: rules.shareBps / 100 })}</Check>
          </Panel>
        )}
        {step >= 5 && (
          <Panel title={step === 5 ? w.steps[4] : w.steps[5]}>
            <div className="flex flex-col gap-1.5">
              <p className="text-[15px] font-medium text-bright">{title}</p>
              <p className="line-clamp-4 whitespace-pre-wrap text-[13px] leading-[1.55] text-muted">{brief}</p>
            </div>
            <ul className="flex flex-col overflow-hidden rounded-lg border-[0.5px] border-line [&>li+li]:border-t-[0.5px] [&>li+li]:border-line">
              {ms.map((m, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-3.5 py-3">
                  <span className="text-[13px] font-medium text-bright">{`M${i + 1} · ${m.title}`}</span>
                  <span className="font-mono text-xs text-fg">{fmtUsd(amounts[i])}</span>
                  <span className="col-span-full font-mono text-[11px] text-faint">{fill(w.reviewLine, { n: i + 1, date: fmtDate(m.due), mode: m.mode === "github" ? t.modeGithub : t.modeClient })}</span>
                  <span className="col-span-full break-words text-xs leading-normal text-muted"><span className="text-fg">{`${en.client.projects.deliverables}: `}</span>{m.deliverables}</span>
                  <span className="col-span-full break-words text-xs leading-normal text-muted"><span className="text-fg">{`${en.client.projects.acceptance}: `}</span>{m.acceptance}</span>
                </li>
              ))}
            </ul>
            {step === 5 && <Check checked={ack} onChange={setAck}>{t.ack}</Check>}
          </Panel>
        )}
        <TxStatus msg={s.msg} sig={s.sig} error={err} />
        {step < 6 && (
          <div className="flex flex-wrap justify-between gap-3">
            {step > 1 ? <Button large onClick={() => go(step - 1)}>{en.common.back}</Button> : <span />}
            {step < 5 ? (
              <Button large primary icon="arrow-right" onClick={next}>{fill(w.continueTo, { step: w.steps[step].toLowerCase() })}</Button>
            ) : (
              <Button large primary icon="arrow-right" disabled={!ack || s.busy} onClick={() => { setStep(6); create(); }}>{fill(t.createFund, { total: fmtUsd(total) })}</Button>
            )}
          </div>
        )}
        {step === 6 && !s.busy && s.msg && !s.sig && <div><Button large onClick={() => go(5)}>{en.common.back}</Button></div>}
      </Split>
    </>
  );
}

type Ctx = { address: string; fundGap: string; nextIndex: number | null; activeIndex: number | null; canCancel: boolean; claimable: number | null };

/** CL-2/CL-3/CL-5 next action: fund the gap, activate next, approve active, file a claim, cancel between milestones. */
export function CommitmentActions({ ctx, mint, claimNote }: { ctx: Ctx; mint: string; claimNote: string }) {
  const a = en.client.commitment.act;
  const s = useSend();
  const [claimOpen, setClaimOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [err, setErr] = useState<string>();
  const key = new PublicKey(ctx.address);
  const load = (p: sdk.Programs) => sdk.loadCommitment(p, key);
  const len = statement.trim().length;

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
          <Button large primary disabled={s.busy} onClick={() => s.run(async (p, me) => [await sdk.fundIx(p, me, key, new PublicKey(mint), bn(BigInt(ctx.fundGap)))])}>
            {fill(t.fund, { amount: fmtUsd(BigInt(ctx.fundGap)) })}
          </Button>
        )}
        {ctx.nextIndex !== null && BigInt(ctx.fundGap) === 0n && (
          <Button large primary disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.activateMilestoneIx(p, await load(p), ctx.nextIndex!)])}>
            {fill(t.activate, { n: ctx.nextIndex + 1 })}
          </Button>
        )}
        {ctx.activeIndex !== null && (
          <Button large primary icon="arrow-right" disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.approveMilestoneIx(p, await load(p), ctx.activeIndex!)])}>
            {fill(en.client.commitment.approve, { milestone: `M${ctx.activeIndex + 1}` })}
          </Button>
        )}
        {ctx.claimable !== null && (
          <Button large onClick={() => setClaimOpen(!claimOpen)}>{claimOpen ? a.cancelClaim : a.fileClaim}</Button>
        )}
        {ctx.canCancel && (
          <Button large disabled={s.busy} onClick={() => s.run(async (p) => [await sdk.cancelCommitmentIx(p, await load(p))])}>{t.cancel}</Button>
        )}
      </div>
      <TxStatus msg={s.msg} sig={s.sig} error={err} />
      {ctx.claimable !== null && claimOpen && (
        <div className="flex flex-col gap-3 border-t-[0.5px] border-line pt-4">
          <Field label={fill(t.claimStatement, { n: ctx.claimable + 1 })} value={statement} onChange={setStatement} rows={4} placeholder={t.claimPlaceholder}
            hint={len < 20 ? `${len} / 20 min` : String(len)} />
          <p className="text-xs leading-normal text-muted">{claimNote}</p>
          <div><Button danger disabled={s.busy || len < 20} onClick={fileClaim}>{en.client.commitment.fileClaim}</Button></div>
        </div>
      )}
    </>
  );
}
