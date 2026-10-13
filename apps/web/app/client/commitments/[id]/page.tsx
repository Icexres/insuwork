import en from "@insuwork/shared/i18n/en.json";
import { MOCK_NPR_PAISA_PER_USDC } from "@insuwork/shared/src/mock-partner";
import { Badge, Detail, Metrics, Notice, PageHeading, Pair, Panel, Row, RowList, Split, StatusDot, TextLink } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { CommitmentActions } from "@/components/client-actions";
import { fmt } from "@/lib/demo";
import { commitmentView, rules, short, usd, viewer } from "@/lib/data";

// CL-2..CL-5 timeline: live on-chain state + off-chain spec, GitHub link, MOCK payout, attestation.
export const dynamic = "force-dynamic";

const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const npr = (paisa: string | bigint) => `NPR ${(Number(paisa) / 100).toLocaleString("en-IN")}`;
const TONE: Record<string, "accent" | "danger" | "muted" | "idle"> = { active: "accent", submitted: "accent", disputed: "danger", released: "muted", pending: "idle", resolved: "muted" };

export default async function CommitmentTimeline({ params }: { params: { id: string } }) {
  const t = en.client.commitment;
  const a = en.client.actions;
  const x = t.act;
  const c = en.common;
  const [v, d, r] = await Promise.all([viewer(), commitmentView(params.id), rules()]);
  const status = (s: string) => a.statusLabels[s as keyof typeof a.statusLabels] ?? s;

  if (!d || d.client !== v?.wallet) {
    return (
      <Workspace role="client" active="/client/commitments" crumb={[en.shell.nav.commitments, t.crumb]}>
        <TextLink href="/client/commitments">{t.all}</TextLink>
        <Panel dashed><p className="text-sm text-fg">{en.voucher.empty.notFound}</p></Panel>
      </Workspace>
    );
  }
  const now = Date.now() / 1000;
  const active = d.activeMilestone;
  const next = active === null && ["funded", "active"].includes(d.status) ? d.milestones.find((m) => m.status === "pending")?.index ?? null : null;
  const claimable = active !== null && !d.milestones[active].claim ? active : null;
  const salary = d.milestones.reduce((s, m) => s + m.amount, 0n);
  const locked = d.milestones.reduce((s, m) => s + m.lockedAmount, 0n);
  const fundGap = d.totalRequired > d.funded ? d.totalRequired - d.funded : 0n;
  const first = d.freelancerName.split(" ")[0];
  const nprOf = (usdc: bigint) => npr((usdc * MOCK_NPR_PAISA_PER_USDC) / 1_000_000n);

  // Next-action copy: what the client can do right now.
  const am = active !== null ? d.milestones[active] : null;
  const act = am?.claim
    ? { badge: x.claimBadge, body: fmt(x.claim, { n: am.index + 1, days: r.rulingDays }) }
    : am
      ? {
          badge: am.status === "submitted" ? x.submittedBadge : x.activeBadge,
          body: `${fmt(am.status === "submitted" ? x.submitted : x.working, { name: d.freelancerName, first, n: am.index + 1, amount: `$${usd(am.amount)}`, npr: nprOf(am.amount) })}${
            am.releaseMode === "githubOracle" && am.github ? ` ${fmt(x.github, { link: `${am.github.repo}#${am.github.pr_number}` })}` : ""}`,
        }
      : fundGap > 0n
        ? { badge: x.fundBadge, body: fmt(x.fund, { amount: `$${usd(fundGap)}` }) }
        : next !== null
          ? { badge: x.betweenBadge, body: fmt(x.between, { n: next + 1, first, amount: `$${usd(d.milestones[next].amount)}` }) }
          : { badge: status(d.status).toUpperCase(), body: d.status === "cancelled" ? x.cancelled : x.completed };
  const actionable = (am && !am.claim) || fundGap > 0n || next !== null;

  return (
    <Workspace role="client" active="/client/commitments" crumb={[en.shell.nav.commitments, d.freelancerName]}>
      <TextLink href="/client/commitments">{t.all}</TextLink>
      <PageHeading
        eyebrow={fmt(t.eyebrow, { address: short(d.address) })}
        title={d.freelancerName}
        subtitle={`${fmt(en.client.new.backedBy, { name: d.vouchers.join(", ") || "—" })} · ${status(d.status)} · ${d.milestoneCount} milestones`}
      />
      <Metrics
        items={[
          { label: t.metrics.contract, value: `$${usd(salary)}`, note: `${d.milestoneCount} milestones` },
          { label: t.metrics.released, value: `$${usd(d.released)}`, note: "MOCK partner" },
          { label: t.metrics.remaining, value: `$${usd(d.remainingSalary)}`, note: status(d.status) },
          { label: t.metrics.fees, value: `${d.premiumBps / 100}% / ${d.feeBps / 100}% / $${usd(d.vestAmount)}`, note: t.metrics.feesNote },
        ]}
      />
      <Split
        side={
          <>
            <Panel side="info" title={t.recourse}>
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
              <Detail label={c.panelRuling} value={`${r.rulingDays} days`} />
              <Detail label={t.recourseLabels.majority} value={t.recourseValues.majority} />
              <Detail label={t.recourseLabels.payout} value={t.recourseValues.payout} />
              <Detail label={t.recourseLabels.refund} value={t.recourseValues.refund} />
              <Detail label={a.claimFee} value={`$${usd(r.claimFee)}`} />
            </Panel>
            <Panel side="info" title={t.backing}>
              <p className="text-base text-bright">{d.vouchers.join(", ") || "—"}</p>
              <p className="font-mono text-xs text-muted">{am && locked > 0n ? fmt(t.lockedFor, { amount: `$${usd(locked)}`, n: am.index + 1 }) : t.noLock}</p>
            </Panel>
            {d.vestAmount > 0n && (
              <Panel side="info" title={en.client.new.totals.vest}>
                <Detail label={en.client.new.amount} value={`$${usd(d.vestAmount)}`} />
                <Detail label={t.columns[3]} value={d.vestStatus} />
                {d.vestDueTs > 0 && <Detail label={a.dueDate} value={day(d.vestDueTs)} />}
                {d.vestPayout && <Detail label="MOCK" value={npr(d.vestPayout.npr_amount)} />}
              </Panel>
            )}
          </>
        }
      >
        <Panel title={t.nextAction} badge={act.badge} highlight={!!actionable}>
          <p className="text-pretty text-sm leading-[1.55] text-fg">{act.body}</p>
          <CommitmentActions
            mint={r.mint}
            claimNote={fmt(x.claimNote, { fee: `$${usd(r.claimFee)}`, days: r.rulingDays })}
            ctx={{
              address: d.address,
              fundGap: fundGap.toString(),
              nextIndex: next, activeIndex: active, claimable,
              canCancel: active === null && ["funded", "active", "draft"].includes(d.status),
            }}
          />
          {am && am.dueTs + r.claimWindowDays * 86400 < now && <p className="text-xs text-muted">{a.windowClosed}</p>}
        </Panel>
        <Panel title={en.client.new.milestones} badge={en.freelancer.home.mockPayments}>
          <RowList ordered>
            {d.milestones.map((m) => {
              const st = m.claim ? "disputed" : m.status;
              return (
                <Row key={m.pubkey} current={m.index === active}>
                  <Pair top={`M${m.index + 1} · $${usd(m.amount)}`} sub={m.github ? `GitHub · ${m.github.repo}#${m.github.pr_number}` : a.modeClient} />
                  <Pair mono top={`${en.client.new.due.replace("{date}", day(m.dueTs))}`}
                    sub={m.releasedTs ? `${status("released")} ${day(m.releasedTs)}` : m.submittedTs ? `${a.submitted} ${day(m.submittedTs)}` : undefined} />
                  <Pair mono top={`$${usd(m.amount)}`} sub={m.payout ? npr(m.payout.npr_amount) : `≈ ${nprOf(m.amount)}`} />
                  <StatusDot tone={TONE[st] ?? "muted"}>
                    {m.claim ? `${status("disputed")}${m.claim.outcome !== "none" ? ` · ${m.claim.outcome}` : ""}` : status(m.status)}
                  </StatusDot>
                </Row>
              );
            })}
          </RowList>
          <Detail label={t.receivedSoFar} value={`$${usd(d.released)}`} />
          <p className="text-xs leading-[1.55] text-faint">{c.fxNote}</p>
        </Panel>
        <Panel title={t.evidence}>
          {d.milestones.map((m) => (
            <div key={m.pubkey} className="flex flex-col gap-2 rounded-lg bg-canvas p-4 shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] text-muted">{`M${m.index + 1}`}</p>
                {m.attestation && <Badge>PDR</Badge>}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{m.spec ?? "—"}</p>
              {m.attestation && (
                <a className="font-mono text-[11px] text-muted underline-offset-2 hover:text-bright hover:underline" href={`https://explorer.solana.com/address/${m.attestation}?cluster=devnet`} target="_blank" rel="noreferrer">
                  {fmt(a.attestation, { address: short(m.attestation) })}
                </a>
              )}
            </div>
          ))}
          {am?.releaseMode === "githubOracle" && am.github && (
            <Notice title={a.oracleTitle}>{fmt(a.oracleBody, { link: `${am.github.repo}#${am.github.pr_number}` })}</Notice>
          )}
        </Panel>
      </Split>
    </Workspace>
  );
}
