import en from "@insuwork/shared/i18n/en.json";
import { Button, Detail, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { contract, fmt, statement as d, users } from "@/lib/demo";

// Printable statement. Received income and estimates stay visually separate.
export default function IncomeStatement() {
  const t = en.family.statement;
  const rule = <div className="h-px w-full bg-rule" />;

  return (
    <Workspace role="family" active="/family/statement" crumb={[en.shell.nav.statement]}>
      <Notice title={en.family.later.title}>{en.family.later.body}</Notice>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "FAMILY" })}
        title={t.title}
        subtitle={t.subtitle}
        // ponytail: wire to window.print() in a client button when interactivity lands.
        action={<Button primary icon="arrow-right">{t.print}</Button>}
      />
      <Split
        side={
          <>
            <Panel title={t.details} badge={en.mock.badge}>
              <Detail label={t.detailLabels.received} value={d.received} />
              <Detail label={t.detailLabels.total} value={d.total} />
              <Detail label={t.detailLabels.preparedFor} value={users.freelancer.name} />
              <p className="text-[13px] text-muted">{t.detailsNote}</p>
            </Panel>
            <Notice title={t.receivedNotice.title}>{t.receivedNotice.body}</Notice>
            <div><Button href="/family">{t.back}</Button></div>
          </>
        }
      >
        <article className="flex flex-col gap-7 rounded-md bg-paper p-8 leading-[1.6] text-ink md:p-11">
          <div className="flex flex-wrap gap-6">
            <div className="flex flex-1 flex-col gap-1">
              <p className="text-[22px]">{en.app.name}</p>
              <p className="text-[13px] text-ink-2">{t.docTitle}</p>
            </div>
            <div className="flex w-[240px] flex-col gap-1">
              <p className="font-mono text-[10px]">{d.id}</p>
              <p className="text-xs text-ink-2">{fmt(t.issued, { date: d.issued })}</p>
              <p className="font-mono text-[11px]">{t.mockData}</p>
            </div>
          </div>
          {rule}
          <div className="flex flex-wrap gap-8">
            {[
              [t.holder, d.holder],
              [t.payer, d.payer],
            ].map(([label, [head, ...lines]]) => (
              <div key={label as string} className="flex flex-1 flex-col gap-2">
                <p className="text-[11px] text-ink-2">{label}</p>
                <p className="text-base">{head}</p>
                {lines.map((l) => (
                  <p key={l} className="text-xs">{l}</p>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-2">{fmt(t.period, { period: d.period, contract: contract.id })}</p>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 text-[11px] text-ink-2">
              {t.columns.map((c) => (
                <p key={c} className="flex-1">{c}</p>
              ))}
            </div>
            {rule}
            {d.credits.map(([period, desc, npr]) => (
              <div key={period} className="flex gap-4 text-[13px]">
                <p className="flex-1">{period}</p>
                <p className="flex-1">{desc}</p>
                <p className="flex-1 font-mono">{npr}</p>
              </div>
            ))}
            {rule}
            <div className="flex gap-6">
              <p className="flex-1 text-base">{t.total}</p>
              <p className="flex-1 font-mono text-xl">{d.total}</p>
            </div>
          </div>
          <p className="text-xs text-ink-2">{t.disclaimer}</p>
          <div className="flex flex-col gap-3 bg-paper-2 p-4">
            <p className="text-[13px]">{t.remaining}</p>
            {d.remaining.map((r) => (
              <p key={r} className="font-mono text-xs">{r}</p>
            ))}
            <p className="text-[11px] text-ink-2">{d.remainingNote}</p>
          </div>
          <p className="text-[11px] text-ink-2">{d.footnote}</p>
          {rule}
          <p className="text-[10px] text-ink-2">{t.pilotCopy}</p>
        </article>
      </Split>
    </Workspace>
  );
}
