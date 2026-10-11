import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Eyebrow, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, operator, users, vault } from "@/lib/demo";

// Keeper never unlocks backing with an open claim; behaviour is OQ-8 (unresolved).
export default function KeeperEvents() {
  const t = en.admin.keeper;
  const k = operator.keeper;
  const c = en.common;

  return (
    <Workspace role="admin" active="/admin/keeper" crumb={[en.shell.nav.keeper]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "OPERATOR" })}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right">{t.run}</Button>}
      />
      <Split
        side={
          <>
            <Panel title={t.wallet}>
              <p className="text-[13px] text-muted">{t.walletBody}</p>
              <Detail label={c.wallet} value={users.admin.wallet} />
              <Detail label={c.network} value={en.shell.envDevnet} />
              <Detail label={t.walletLabels.balance} value={k.balance} />
              <Detail label={t.walletLabels.mode} value={k.mode} />
              <Notice title={c.pilotBoundaries.title}>{c.pilotBoundaries.body}</Notice>
            </Panel>
            <Panel title={t.rules}>
              <Detail label={c.claimWindow} value={vault.rules.claimWindow} />
              <Detail label={c.panelRuling} value={vault.rules.ruling} />
              <Detail label={t.ruleLabels.release} value={k.release} />
              <Detail label={t.ruleLabels.unlock} value={k.unlock} />
              <p className="text-[13px] text-muted">{t.rulesNote}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.overview} badge={t.oqBadge}>
          <p className="text-sm text-muted">{t.overviewBody}</p>
          <Detail label={t.labels.lastRun} value={k.lastRun} />
          <Detail label={t.labels.scanned} value={k.scanned} />
          <Detail label={t.labels.unlocked} value={k.unlocked} />
          <Detail label={c.claimWindow} value={vault.rules.claimWindow} />
          <Detail label={c.panelRuling} value={vault.rules.ruling} />
          <Notice title={t.behaviorNotice.title}>{t.behaviorNotice.body}</Notice>
          <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-line bg-surface p-4">
            <Eyebrow>{t.history}</Eyebrow>
            {k.history.map(([when, what]) => (
              <div key={when} className="flex gap-4 text-fg">
                <p className="flex-1 text-[13px]">{when}</p>
                <p className="w-[150px] text-right font-mono text-xs leading-[1.6]">{what}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t.events} badge={t.eventsBadge}>
          <p className="text-[13px] text-muted">{t.eventsBody}</p>
          <DataTable
            columns={t.columns}
            rows={k.events.map(([event, ts, entity, amount, status]) => [
              event,
              ts,
              entity,
              amount,
              <span key="s" className="text-fg">{status}</span>,
            ])}
          />
        </Panel>
      </Split>
    </Workspace>
  );
}
