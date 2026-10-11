import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, Divider, Eyebrow, Field, Notice, PageHeading, Panel, Split, Steps } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, freelancer, triage as d } from "@/lib/demo";

// AI triage is advisory only (AGENTS.md rule 9). Chat wiring comes with packages/triage.
export default function TriageInterview() {
  const t = en.freelancer.triage;
  const section = t.sectionList[d.section - 1];

  return (
    <Workspace role="freelancer" active="/freelancer/triage" crumb={[en.shell.nav.triage]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={t.title} subtitle={t.subtitle} />
      <Split
        side={
          <>
            <Panel title={t.sections} badge={`${d.section} / ${t.sectionList.length}`}>
              <Steps steps={t.sectionList} current={d.section} />
              <p className="text-xs text-muted">{t.duration}</p>
            </Panel>
            <Notice title={t.usageNotice.title}>{t.usageNotice.body}</Notice>
            <Panel title={t.control}>
              <p className="text-[13px] text-muted">{t.controlBody}</p>
              <div><Badge>{t.reviewBadge}</Badge></div>
              <div><Button>{en.common.saveAndLeave}</Button></div>
              <Divider />
              <p className="text-xs text-muted">{t.neverAsk}</p>
            </Panel>
          </>
        }
      >
        <Panel title={section} badge={fmt(t.badge, { turn: d.turn, total: d.total })}>
          <div className="h-[3px] w-full bg-line">
            <div className="h-full bg-fg" style={{ width: `${(d.turn / d.total) * 100}%` }} />
          </div>
          {d.messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col gap-2 rounded-md border-[0.5px] border-line p-[18px] ${m.from === "ai" ? "bg-surface" : "bg-raised"}`}
            >
              <Eyebrow>{m.from === "ai" ? fmt(t.interviewer, { section: m.section ?? "" }) : freelancer.first.toUpperCase()}</Eyebrow>
              <p className="text-sm leading-normal text-fg">{m.text}</p>
            </div>
          ))}
          <Field label={t.answer} value={d.draft} rows={3} />
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted">{t.hint}</p>
            <Button primary icon="arrow-up">{t.send}</Button>
          </div>
        </Panel>
      </Split>
    </Workspace>
  );
}
