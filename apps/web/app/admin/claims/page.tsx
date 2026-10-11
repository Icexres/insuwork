import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Fact, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { claim as d, operator, users, vault } from "@/lib/demo";

export default function ClaimsQueue() {
  const t = en.admin.claims;
  const a = t.activeLabels;

  return (
    <Workspace role="admin" active="/admin/claims" crumb={[t.crumb]}>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right" href={`/panel/claims/${d.id}`}>{t.openPanel}</Button>}
      />
      <Metrics
        items={[
          { label: t.metrics.open, value: "1", note: t.metrics.openNote },
          { label: t.metrics.voting, value: vault.rules.ruling, note: t.metrics.votingNote },
          { label: t.metrics.ruling, value: vault.rules.ruling, note: t.metrics.rulingNote },
          { label: t.metrics.reviewers, value: d.reviewers, note: t.metrics.reviewersNote },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.active} badge={d.id}>
              <p className="text-xl font-medium leading-[1.2] text-white">{d.parties}</p>
              <Detail label={a.milestone} value={d.milestone} />
              <Detail label={a.filed} value={d.filedShort} />
              <Detail label={a.amount} value={d.stake} />
              <Detail label={a.panel} value={d.panelStatus} />
              <Detail label={a.majority} value={d.voted} />
              <Detail label={a.finalization} value={d.finalization} />
              <div><Button href={`/panel/claims/${d.id}`}>{t.openPanel}</Button></div>
            </Panel>
            <Panel title={t.reviewPanel} badge={d.reviewers}>
              {d.panel.map((m) => (
                <div key={m.name} className="flex gap-4">
                  <Fact label={m.seat} value={m.name} />
                  <Fact label={t.vote} value={d.vote} />
                </div>
              ))}
              <Notice title={t.majorityNotice.title}>{t.majorityNotice.body}</Notice>
            </Panel>
            <Panel title={t.integrity} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{t.integrityBody}</p>
              <Detail label={en.common.wallet} value={users.admin.wallet} />
              <Detail label={en.shell.nav.vault} value={vault.address} />
              <Detail label={en.common.network} value={en.shell.envDevnet} />
              <Detail label={t.source} value={d.source} />
            </Panel>
          </>
        }
      >
        <Panel title={t.title} badge={t.queueBadge}>
          {/* ponytail: filter chips are static; "Voting" is the design's selected state. */}
          <div className="flex flex-wrap gap-2">
            {t.filters.map((f) => (
              <Button key={f} primary={f === d.status}>{f}</Button>
            ))}
          </div>
          <DataTable
            columns={t.columns}
            rows={[
              [
                d.id,
                <span key="p" className="font-sans text-[13px] text-fg">{d.parties}</span>,
                [d.idNote.split(" · ")[0], d.milestone],
                <span key="s" className="text-fg">{d.status}</span>,
                <Button key="b" primary href={`/panel/claims/${d.id}`}>{t.openReview}</Button>,
              ],
            ]}
          />
          <p className="text-xs text-muted">{t.assignmentNote}</p>
        </Panel>
        <Panel title={t.workflow}>
          {operator.workflow.map((row) => (
            <div key={row[0][0]} className="flex gap-4">
              {row.map(([label, value]) => (
                <Fact key={label} label={label} value={value} />
              ))}
            </div>
          ))}
        </Panel>
      </Split>
    </Workspace>
  );
}
