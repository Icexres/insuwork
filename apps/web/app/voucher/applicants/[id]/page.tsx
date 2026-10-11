import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Button, Check, Detail, Divider, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, report as d } from "@/lib/demo";

// Advisory report only — never a credential (AGENTS.md rule 9).
// ponytail: renders the one demo report for any id until reports are fetched by id.
export default function ApplicantReport() {
  const t = en.voucher.report;
  const c = en.common;

  return (
    <Workspace role="voucher" active="/voucher/applicants" crumb={[en.shell.nav.applicants, d.name]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })}
        title={fmt(t.title, { name: d.name })}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right">{t.bookCall}</Button>}
      />
      <Split
        side={
          <Panel title={c.pilotBoundaries.title} badge={en.shell.envDevnet}>
            <p className="text-[13px] text-muted">{c.pilotBoundaries.body}</p>
          </Panel>
        }
      >
        <Panel title={t.summary} badge={t.advisory}>
          <div className="flex items-center gap-4">
            <Avatar initials={d.initials} size={56} square />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-[22px] font-medium leading-[1.2] text-white">{d.name}</p>
              <p className="text-[13px] text-muted">{d.stack}</p>
              <p className="text-[13px] text-muted">{d.highlight}</p>
            </div>
          </div>
          <Divider />
          {d.summary.map(([label, value]) => (
            <Detail key={label} label={label} value={value} />
          ))}
          <Notice title={t.advisoryNotice.title}>{t.advisoryNotice.body}</Notice>
        </Panel>
        <Panel title={t.decision} badge={en.shell.envDevnet}>
          <Detail label={t.decisionLabels.deposit} value={d.decision.deposit} />
          <Detail label={t.decisionLabels.allocated} value={d.decision.allocated} />
          <Detail label={t.decisionLabels.remaining} value={d.decision.remaining} />
          <Detail label={t.decisionLabels.cap} value={d.decision.cap} />
          <Detail label={t.decisionLabels.after} value={d.decision.after} />
          <Notice title={t.riskTitle}>{c.atRisk.body}</Notice>
          <Check defaultChecked>{c.riskAck}</Check>
          <div className="flex justify-between">
            <Button href="/voucher/applicants">{c.back}</Button>
            <Button primary icon="arrow-right">{fmt(t.backButton, { name: d.first, cap: d.decision.cap })}</Button>
          </div>
        </Panel>
        <Panel title={t.questions}>
          {d.questions.map(([label, value]) => (
            <Detail key={label} label={label} value={value} />
          ))}
          <Notice title={t.questionsNoticeTitle}>{d.questionsNote}</Notice>
        </Panel>
      </Split>
    </Workspace>
  );
}
