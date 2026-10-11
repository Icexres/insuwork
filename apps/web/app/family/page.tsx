import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, DataTable, Detail, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { backer, contract, family as d, fmt, freelancer, users } from "@/lib/demo";

// Read-only family view. No wallet, no crypto (AGENTS.md rule 1).
export default function FamilyOverview() {
  const t = en.family.overview;
  const name = freelancer.first;

  return (
    <Workspace role="family" active="/family" crumb={[en.shell.nav.overview]}>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "FAMILY" })}
        title={fmt(t.title, { name })}
        subtitle={fmt(t.subtitle, { name })}
        action={<Button primary icon="arrow-right" href="/family/statement">{t.openStatement}</Button>}
      />
      <Metrics
        items={[
          { label: t.metrics.received, value: contract.receivedNpr, note: d.receivedNote },
          { label: t.metrics.total, value: contract.estimateNpr, note: d.totalNote },
          { label: t.metrics.monthly, value: d.monthly, note: t.metrics.monthlyNote },
        ]}
      />
      <Panel title={t.progress} badge={t.progressBadge}>
        <div className="flex gap-2">
          {contract.milestones.map((m, i) => (
            <div key={m.work} className={`h-1.5 flex-1 ${i < d.paid ? "bg-fg" : "bg-line"}`} />
          ))}
        </div>
        <p className="text-sm text-muted">{d.progressText}</p>
      </Panel>
      <Split
        side={
          <>
            <Panel title={t.glance}>
              <p className="text-xl font-medium leading-[1.2] text-white">{contract.client}</p>
              <p className="text-[13px] text-muted">{d.glance.sub}</p>
              <Detail label={t.glanceLabels.freelancer} value={users.freelancer.name} />
              <Detail label={t.glanceLabels.period} value={d.glance.period} />
              <Detail label={t.glanceLabels.bank} value={d.glance.bank} />
              <Detail label={t.glanceLabels.backer} value={backer.name} />
              <div><Badge>{t.readOnly}</Badge></div>
            </Panel>
            <Notice title={t.guaranteeNotice.title}>{fmt(t.guaranteeNotice.body, { name })}</Notice>
            <Panel title={t.update}>
              <p className="text-[13px] text-muted">{fmt(t.updateBody, { name })}</p>
              <div><Button>{fmt(t.contact, { name })}</Button></div>
            </Panel>
          </>
        }
      >
        <Panel title={t.schedule} badge={en.mock.badge}>
          <DataTable
            columns={en.common.paymentColumns}
            rows={contract.milestones.map((m) => [m.work, m.due, m.npr, m.status])}
          />
          <Notice title={t.reviewNotice.title}>{fmt(t.reviewNotice.body, { client: contract.client, name })}</Notice>
          <p className="text-[13px] text-muted">{fmt(t.fxNote, { rate: contract.fxRate })}</p>
        </Panel>
      </Split>
    </Workspace>
  );
}
