import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Metrics, Notice, PageHeading, Panel } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { applicants as d, fmt, vault } from "@/lib/demo";

export default function Applicants() {
  const t = en.voucher.applicants;
  const c = en.common;

  return (
    <Workspace role="voucher" active="/voucher/applicants" crumb={[en.shell.nav.applicants]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button href="/voucher/dashboard">{t.viewCapacity}</Button>}
      />
      <Metrics
        items={[
          { label: t.metrics.remaining, value: d.capacity.remaining, note: t.metrics.remainingNote },
          { label: t.metrics.allocated, value: d.capacity.allocated, note: d.capacity.allocatedNote },
          { label: t.metrics.deposit, value: d.capacity.deposit, note: d.capacity.depositNote },
          { label: t.metrics.premium, value: d.capacity.premium, note: t.metrics.premiumNote },
        ]}
      />
      <Panel title={t.reports} badge={fmt(t.reportsBadge, { count: d.list.length })}>
        <p className="text-[13px] text-muted">{t.reportsBody}</p>
        <DataTable
          columns={t.columns}
          rows={d.list.map((a) => [
            <span key="n" className="flex flex-col gap-1">
              <span className="text-sm font-medium text-fg">{a.name}</span>
              <span className="text-[13px] text-muted">{a.sub}</span>
            </span>,
            a.background,
            a.comms,
            a.status,
            a.ready ? (
              <Button key="b" href={`/voucher/applicants/${a.id}`}>{t.review}</Button>
            ) : (
              <Button key="b" primary>{t.pending}</Button>
            ),
          ])}
        />
      </Panel>
      <Panel title={t.guidance}>
        <Detail label={t.guidanceLabels.allocation} value={t.yourDecision} />
        <Detail label={t.guidanceLabels.premium} value={fmt(t.premiumOnSuccess, { rate: d.capacity.premium })} />
        <Detail label={c.claimWindow} value={vault.rules.claimWindow} />
        <Detail label={c.panelRuling} value={vault.rules.ruling} />
        <p className="text-xs text-muted">{t.guidanceNote}</p>
        <Notice title={t.capacityNotice.title}>
          {fmt(t.capacityNotice.body, { deposit: d.capacity.deposit, remaining: d.capacity.remaining })}
        </Notice>
      </Panel>
    </Workspace>
  );
}
