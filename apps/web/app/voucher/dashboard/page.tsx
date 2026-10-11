import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Field, Metrics, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, users, vault as d } from "@/lib/demo";

// One vault per voucher, 1:1 leverage (AGENTS.md rules 4–5).
export default function BondDashboard() {
  const t = en.voucher.dashboard;
  const c = en.common;
  const twoLine = (a: string, b: string) => (
    <span className="flex flex-col gap-1">
      <span className="text-[13px] text-fg">{a}</span>
      <span className="text-[11px] text-muted">{b}</span>
    </span>
  );

  return (
    <Workspace role="voucher" active="/voucher/dashboard" crumb={[en.shell.nav.dashboard]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })}
        title={fmt(t.title, { name: users.voucher.name })}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right" href="/voucher/applicants">{t.backFreelancer}</Button>}
      />
      <Metrics
        cards
        items={[
          { label: t.metrics.deposited, value: d.deposited, note: d.metricNotes.deposited },
          { label: t.metrics.allocated, value: d.allocated, note: d.metricNotes.allocated },
          { label: t.metrics.locked, value: d.locked, note: d.metricNotes.locked },
          { label: t.metrics.unallocated, value: d.unallocated, note: t.metrics.withdrawable },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.overview} badge={en.shell.envDevnet}>
              <p className="text-[22px] font-medium leading-[1.2] text-white">{fmt(t.vault, { vault: d.address })}</p>
              <p className="text-[13px] text-muted">{t.vaultSub}</p>
              <Detail label={t.bars.deposited} value={d.deposited} />
              <Detail label={t.bars.allocated} value={d.allocated} />
              <Detail label={t.bars.locked} value={d.locked} />
              <Detail label={t.bars.unallocated} value={d.unallocated} />
              <Detail label={t.premiumsEarned} value={d.premiums} />
              <Detail label={t.claimsPaid} value={d.claimsPaid} />
            </Panel>
            <Panel title={t.withdraw} badge={`${d.unallocated} USDC`}>
              <p className="text-[13px] text-muted">{t.withdrawBody}</p>
              <Field label={t.withdrawAmount} value={d.unallocated} />
              <Detail label={c.networkFee} value={d.networkFee} />
              <div><Button>{t.withdrawButton}</Button></div>
            </Panel>
            <Panel title={t.activity} badge={t.demo}>
              <ul className="flex flex-col gap-5 text-[13px] text-muted">
                {d.activity.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Panel>
          </>
        }
      >
        <Panel title={t.utilisation} badge={t.leverageBadge}>
          <p className="text-[13px] text-muted">{t.utilisationBody}</p>
          <div className="flex flex-wrap gap-3">
            {d.bars.map((b) => (
              <div key={b.key} className="flex min-w-[120px] flex-1 flex-col gap-2 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted">{t.bars[b.key as keyof typeof t.bars]}</span>
                  <span className="text-fg">{b.value}</span>
                </div>
                <div className="h-2 rounded-full bg-raised">
                  <div className="h-full rounded-full bg-edge" style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t.backings} badge={fmt(t.activeBadge, { count: d.backings.length })}>
          <DataTable
            columns={t.backingColumns}
            rows={d.backings.map((b) => [
              twoLine(b.name, b.client),
              twoLine(b.cap, b.lockedPct),
              <span key="p" className="text-[13px] text-fg">{b.premiums}</span>,
              twoLine(b.status, b.claims),
            ])}
          />
          <Detail label={t.totalPremiums} value={d.premiums} />
          <Detail label={t.claimsPaid} value={d.claimsPaid} />
        </Panel>
      </Split>
    </Workspace>
  );
}
