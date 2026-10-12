import en from "@insuwork/shared/i18n/en.json";
import { DataTable, Detail, Lifecycle, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { CommitmentActions } from "@/components/client-actions";
import { fmt } from "@/lib/demo";
import { commitmentView, rules, short, usd, viewer } from "@/lib/data";

// CL-2..CL-5 timeline: live on-chain state + off-chain spec, GitHub link, MOCK payout, attestation.
export const dynamic = "force-dynamic";

const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const npr = (paisa: string) => `NPR ${(Number(paisa) / 100).toLocaleString("en-IN")}`;

export default async function CommitmentTimeline({ params }: { params: { id: string } }) {
  const t = en.client.commitment;
  const a = en.client.actions;
  const c = en.common;
  const [v, d, r] = await Promise.all([viewer(), commitmentView(params.id), rules()]);
  const status = (s: string) => a.statusLabels[s as keyof typeof a.statusLabels] ?? s;

  if (!d || d.client !== v?.wallet) {
    return (
      <Workspace role="client" active="/client/commitments" crumb={[t.crumb]}>
        <Panel><p className="text-sm text-muted">{en.voucher.empty.notFound}</p></Panel>
      </Workspace>
    );
  }
  const now = Date.now() / 1000;
  const active = d.activeMilestone;
  const next = active === null && ["funded", "active"].includes(d.status) ? d.milestones.find((m) => m.status === "pending")?.index ?? null : null;
  const claimable = active !== null && !d.milestones[active].claim ? active : null;
  const salary = d.milestones.reduce((x, m) => x + m.amount, 0n);
  const lastReleased = [...d.milestones].reverse().find((m) => m.status === "released");

  return (
    <Workspace role="client" active="/client/commitments" crumb={[t.crumb, short(d.address)]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "CLIENT" })}
        title={t.title}
        subtitle={`${d.freelancerName} · ${status(d.status)} · ${d.milestoneCount} × milestone`}
      />
      <Lifecycle
        stages={[
          { label: "01 / BACKER", title: d.vouchers.join(", ") || "—", note: `${d.milestones.filter((m) => m.lockedAmount > 0n).length ? `$${usd(d.milestones.reduce((x, m) => x + m.lockedAmount, 0n))} locked` : "—"}` },
          { label: "02 / CONTRACT", title: status(d.status), note: `$${usd(d.totalRequired)} total · $${usd(d.funded)} funded` },
          { label: "03 / DELIVERY", title: lastReleased ? `M${lastReleased.index + 1} ${status("released")}` : "—", note: lastReleased ? day(lastReleased.releasedTs) : "" },
          { label: "04 / BANK CREDIT", title: lastReleased?.payout ? npr(lastReleased.payout.npr_amount) : "—", note: lastReleased?.payout ? "MOCK" : "" },
        ]}
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
            <Panel title={t.recourse}>
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
              <Detail label={c.panelRuling} value={`${r.rulingDays} days`} />
              <Detail label={t.recourseLabels.majority} value={t.recourseValues.majority} />
              <Detail label={t.recourseLabels.payout} value={t.recourseValues.payout} />
              <Detail label={t.recourseLabels.refund} value={t.recourseValues.refund} />
              <Detail label={a.claimFee} value={`$${usd(r.claimFee)}`} />
            </Panel>
            <Panel title={en.client.new.totals.vest}>
              <Detail label={en.client.new.amount} value={`$${usd(d.vestAmount)}`} />
              <Detail label={t.columns[3]} value={d.vestStatus} />
              {d.vestDueTs > 0 && <Detail label={a.dueDate} value={day(d.vestDueTs)} />}
              {d.vestPayout && <Detail label="MOCK" value={npr(d.vestPayout.npr_amount)} />}
            </Panel>
          </>
        }
      >
        <Panel title={t.title} badge={en.freelancer.home.mockPayments}>
          <DataTable
            columns={t.columns}
            rows={d.milestones.map((m) => [
              [`M${m.index + 1} · $${usd(m.amount)}`, m.github ? `${m.github.repo}#${m.github.pr_number}` : a.modeClient],
              [day(m.dueTs), m.releasedTs ? day(m.releasedTs) : m.submittedTs ? `${a.submitted} ${day(m.submittedTs)}` : ""],
              m.payout ? [`$${usd(m.amount)}`, npr(m.payout.npr_amount)] : `$${usd(m.amount)}`,
              m.claim ? [status("disputed"), m.claim.outcome !== "none" ? m.claim.outcome : m.claim.status] : status(m.status),
            ])}
          />
          <Detail label={t.receivedSoFar} value={`$${usd(d.released)}`} />
          {active !== null && d.milestones[active].releaseMode === "githubOracle" && (
            <Notice title={a.oracleTitle}>{fmt(a.oracleBody, { link: d.milestones[active].github ? `${d.milestones[active].github!.repo}#${d.milestones[active].github!.pr_number}` : "—" })}</Notice>
          )}
          <p className="text-xs text-muted">{c.fxNote}</p>
        </Panel>
        <Panel title={t.evidence}>
          {d.milestones.map((m) => (
            <div key={m.pubkey} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-white">{`M${m.index + 1}`}</p>
              <p className="whitespace-pre-wrap text-[13px] text-muted">{m.spec ?? "—"}</p>
              {m.attestation && (
                <a className="font-mono text-[11px] text-muted underline" href={`https://explorer.solana.com/address/${m.attestation}?cluster=devnet`} target="_blank" rel="noreferrer">
                  {fmt(a.attestation, { address: short(m.attestation) })}
                </a>
              )}
            </div>
          ))}
        </Panel>
        <Panel title={a.actionsTitle}>
          <CommitmentActions
            mint={r.mint}
            ctx={{
              address: d.address,
              fundGap: (d.totalRequired > d.funded ? d.totalRequired - d.funded : 0n).toString(),
              nextIndex: next, activeIndex: active, claimable,
              canCancel: active === null && ["funded", "active", "draft"].includes(d.status),
            }}
          />
          {active !== null && d.milestones[active].dueTs + r.claimWindowDays * 86400 < now && <p className="text-xs text-muted">{a.windowClosed}</p>}
        </Panel>
      </Split>
    </Workspace>
  );
}
