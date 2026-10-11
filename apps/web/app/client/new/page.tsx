import en from "@insuwork/shared/i18n/en.json";
import { Button, Detail, Field, Notice, PageHeading, Panel, Split, Steps } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { backer, contract, fmt, newCommitment as d, users } from "@/lib/demo";

// Commitment wizard, step 2 (Milestones). Releases go only to the registered partner (AGENTS.md rule 3).
export default function NewCommitment() {
  const t = en.client.new;
  const f = t.fields;

  return (
    <Workspace role="client" active="/client/new" crumb={[en.shell.nav.newCommitment]}>
      <PageHeading
        eyebrow={t.eyebrow}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button>{t.saveDraft}</Button>}
      />
      <Steps steps={t.steps} current={2} horizontal />
      <Split
        side={
          <>
            <Panel title={t.context}>
              <p className="text-xl font-medium leading-[1.2] text-white">{contract.client}</p>
              <p className="text-[13px] text-muted">{d.treasury}</p>
              <p className="text-[13px] text-muted">{t.contextBody}</p>
              <div><Button>{t.viewClient}</Button></div>
            </Panel>
            <Panel title={t.funding}>
              <Detail label={t.fundingLabels.salary} value={d.totals.salary} />
              <Detail label={t.fundingLabels.premium} value={d.totals.premium} />
              <Detail label={t.fundingLabels.platform} value={d.totals.fee} />
              <Detail label={t.fundingLabels.vest} value={d.vestNote} />
              <Notice title={fmt(t.fundNotice.title, { total: d.totals.fund })}>{t.fundNotice.body}</Notice>
            </Panel>
            <Panel title={en.common.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{en.common.pilotBoundaries.body}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.details} badge={t.selected}>
          <Field label={f.title} value={d.title} />
          <Field label={f.client} value={contract.client} />
          <Field label={f.freelancer} value={users.freelancer.name} />
          <Field label={f.backer} value={backer.name} />
          <Field label={f.cap} value={d.cap} />
          <Field label={f.mode} value={d.mode} />
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">{f.partner}</p>
            <p className="text-sm text-fg">{t.partnerValue}</p>
          </div>
          <Notice title={t.relatedNotice.title}>{t.relatedNotice.body}</Notice>
        </Panel>
        <Panel
          title={t.milestones}
          badge={t.stepBadge}
          action={<Button>{t.continue}</Button>}
        >
          <p className="text-xs text-muted">{fmt(t.milestonesBody, { cap: d.cap })}</p>
          {d.milestones.map((m) => (
            <div key={m.title} className="flex flex-col gap-3 rounded-md border-[0.5px] border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-white">{m.title}</p>
                <p className="font-mono text-[11px] text-muted">{fmt(t.due, { date: m.due })}</p>
              </div>
              <p className="text-[13px] text-muted">{m.spec}</p>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted">{t.amount}</span>
                <span className="font-mono text-fg">{m.amount}</span>
              </div>
            </div>
          ))}
          <Detail label={t.totals.salary} value={d.totals.salary} />
          <Detail label={t.totals.premium} value={d.totals.premium} />
          <Detail label={t.totals.fee} value={d.totals.fee} />
          <Detail label={t.totals.vest} value={d.totals.vest} />
          <Detail label={t.totals.fund} value={d.totals.fund} />
          <p className="text-xs text-muted">{t.payNote}</p>
        </Panel>
      </Split>
    </Workspace>
  );
}
