import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Fact, Lifecycle, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { commitment as d, contract, fmt, vault } from "@/lib/demo";

// ponytail: renders demo commitment NW-01 for any id until commitments are fetched by id.
export default function CommitmentTimeline() {
  const t = en.client.commitment;
  const c = en.common;

  return (
    <Workspace role="client" active="/client/commitments/NW-01" crumb={[t.crumb]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "CLIENT" })}
        title={t.title}
        subtitle={d.subtitle}
        action={<Button primary icon="arrow-right">{fmt(t.approve, { milestone: d.pending })}</Button>}
      />
      <Lifecycle stages={d.lifecycle} />
      <Metrics
        items={[
          { label: t.metrics.contract, value: d.metrics.contract, note: d.metrics.contractNote },
          { label: t.metrics.released, value: d.metrics.released, note: d.metrics.releasedNote },
          { label: t.metrics.remaining, value: d.metrics.remaining, note: d.metrics.remainingNote },
          { label: t.metrics.fees, value: d.metrics.fees, note: t.metrics.feesNote },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.clientDetails}>
              <p className="text-xl font-medium leading-[1.2] text-white">{contract.client}</p>
              <p className="text-[13px] text-muted">{contract.clientEmail}</p>
              <p className="text-[13px] text-muted">{d.contractLine}</p>
              <div><Button>{t.contactClient}</Button></div>
            </Panel>
            <Panel title={t.recourse}>
              <Detail label={c.claimWindow} value={vault.rules.claimWindow} />
              <Detail label={c.panelRuling} value={vault.rules.ruling} />
              <Detail label={t.recourseLabels.majority} value={t.recourseValues.majority} />
              <Detail label={t.recourseLabels.payout} value={t.recourseValues.payout} />
              <Detail label={t.recourseLabels.refund} value={t.recourseValues.refund} />
              <p className="text-xs text-muted">{t.recourseBody}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.title} badge={en.freelancer.home.mockPayments}>
          <p className="text-[13px] text-muted">{contract.summary}</p>
          <DataTable columns={t.columns} rows={contract.milestones.map((m) => [m.work, m.due, m.usd, m.status])} />
          <Detail label={t.receivedSoFar} value={d.received} />
          <Notice title={d.reviewNotice.title}>{d.reviewNotice.body}</Notice>
          <p className="text-xs text-muted">{c.fxNote}</p>
        </Panel>
        <Panel title={t.evidence}>
          {d.evidence.map((row) => (
            <div key={row[0][0]} className="flex flex-wrap gap-4">
              {row.map(([label, value]) => (
                <Fact key={label} label={label} value={value} />
              ))}
            </div>
          ))}
          <div><Button>{t.fileClaim}</Button></div>
        </Panel>
      </Split>
    </Workspace>
  );
}
