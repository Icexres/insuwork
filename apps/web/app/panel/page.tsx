import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, Fact, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { claim as d, fmt, users, vault } from "@/lib/demo";

export default function AssignedClaims() {
  const t = en.panel.claims;
  const l = t.labels;
  const grid: [string, string][][] = [
    [[l.assignedTo, users.panel.name], [l.filed, d.filed], [l.stake, d.stake]],
    [[l.client, d.client], [l.freelancer, d.freelancerRef], [l.milestone, d.milestone]],
    [[l.spec, d.spec], [l.evidence, d.evidence], [l.response, d.response]],
    [[l.deadline, d.deadline], [l.remaining, d.remaining], [l.ruling, vault.rules.ruling]],
  ];

  return (
    <Workspace role="panel" active="/panel" crumb={[en.shell.nav.assignedClaims]}>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "PANELIST" })}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button>{t.queueButton}</Button>}
      />
      <Split
        side={
          <>
            <Panel title={t.overview}>
              <Fact mono label={t.overviewLabels.panelist} value={users.panel.name} />
              <Fact mono label={t.overviewLabels.wallet} value={users.panel.wallet} />
              <Fact mono label={t.overviewLabels.assigned} value="1" />
              <Fact mono label={t.overviewLabels.window} value={vault.rules.ruling} />
              <div><Button>{t.openProfile}</Button></div>
            </Panel>
            <Panel title={t.voting}>
              {t.votingItems.map((v) => (
                <Fact mono key={v.label} label={v.label} value={v.value} />
              ))}
              <Notice title={t.pseudonymNotice.title}>{t.pseudonymNotice.body}</Notice>
            </Panel>
            <Notice title={en.common.pilotBoundaries.title}>{en.common.pilotBoundaries.body}</Notice>
          </>
        }
      >
        <Panel title={t.queue} badge={fmt(t.assignedBadge, { count: 1 })}>
          <p className="text-[13px] text-muted">{t.queueBody}</p>
          <div className="flex flex-col gap-4 rounded-md border-[0.5px] border-line bg-canvas p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Badge>{d.id}</Badge>
                <p className="text-[17px] font-medium text-fg">{d.title}</p>
              </div>
              <Badge>{t.notVoted}</Badge>
            </div>
            {grid.map((row, i) => (
              <div key={i} className="flex flex-wrap gap-4">
                {row.map(([label, value]) => (
                  <Fact mono key={label} label={label} value={value} />
                ))}
              </div>
            ))}
            <Notice title={t.guidanceNotice.title}>{t.guidanceNotice.body}</Notice>
            <div className="flex gap-2">
              <Button>{t.openEvidence}</Button>
              <Button primary icon="arrow-right" href={`/panel/claims/${d.id}`}>{t.reviewClaim}</Button>
            </div>
          </div>
        </Panel>
        <Panel title={t.checklist}>
          {/* ponytail: visual checklist only; not persisted. */}
          {t.checklistItems.map((item) => (
            <label key={item} className="flex items-center gap-3 text-[13px] text-fg">
              <input type="checkbox" className="size-5 shrink-0 accent-accent" />
              {item}
            </label>
          ))}
          <p className="text-xs text-muted">{t.majorityNote}</p>
        </Panel>
      </Split>
    </Workspace>
  );
}
