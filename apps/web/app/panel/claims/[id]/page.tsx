import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Badge, Button, Detail, Eyebrow, Field, Lifecycle, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { claim as d, fmt, users } from "@/lib/demo";

// ponytail: renders demo claim CLM-0009 for any id until claims are fetched by id.
export default function ClaimReview() {
  const t = en.panel.review;

  return (
    <Workspace role="panel" active="/panel" crumb={[t.crumb, d.id]}>
      <PageHeading
        eyebrow={t.eyebrow}
        title={fmt(t.title, { id: d.id })}
        subtitle={d.subtitle}
        action={<Button primary icon="arrow-right">{t.openEvidence}</Button>}
      />
      <Metrics
        cards
        items={[
          { label: t.metrics.id, value: d.id, note: d.idNote },
          { label: t.metrics.client, value: d.client, note: d.milestone },
          { label: t.metrics.freelancer, value: d.freelancerRef, note: t.metrics.freelancerNote },
          { label: t.metrics.locked, value: d.stake, note: d.stakeNote },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.members} badge={fmt(t.pendingCount, { count: d.panel.length })}>
              {d.panel.map((m) => (
                <div key={m.name} className="flex items-center gap-3">
                  <Avatar initials={m.initials} size={36} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-medium text-fg">{m.name}</p>
                    <p className="font-mono text-[11px] text-muted">{m.role}</p>
                  </div>
                  <Badge>{t.memberPending}</Badge>
                </div>
              ))}
            </Panel>
            <Panel title={t.fees}>
              <Detail label={en.common.wallet} value={users.panel.wallet} />
              <Detail label={t.feeLabels.claimFee} value={d.fees.claimFee} />
              <Detail label={t.feeLabels.networkFee} value={d.fees.networkFee} />
              <Detail label={t.feeLabels.policy} value={d.fees.policy} />
              <Notice title={t.oqNotice.title}>{t.oqNotice.body}</Notice>
            </Panel>
            <Panel>
              <div className="flex flex-col items-start gap-3">
                <Button>{t.saveDraft}</Button>
                <Button primary>{t.submit}</Button>
                <p className="text-[11px] text-faint">{t.submitNote}</p>
              </div>
            </Panel>
          </>
        }
      >
        <Panel title={t.overview} badge={t.pending}>
          <p className="text-sm text-muted">{d.overview}</p>
          <Lifecycle stages={d.timeline} bare />
          <div className="flex flex-wrap gap-4">
            {(
              [
                [t.clientEvidence, d.files.client],
                [t.freelancerEvidence, d.files.freelancer],
              ] as [string, string[]][]
            ).map(([label, [file, hash]]) => (
              <div key={label} className="flex min-w-[200px] flex-1 flex-col gap-1.5 rounded-lg border-[0.5px] border-line bg-surface p-4">
                <Eyebrow>{label}</Eyebrow>
                <p className="text-sm text-fg">{file}</p>
                <p className="font-mono text-[11px] text-faint">{hash}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t.rationale}>
          <fieldset className="flex flex-col gap-5">
            {t.choices.map((ch) => (
              <label key={ch.label} className="flex cursor-pointer items-center gap-3 rounded-lg border-[0.5px] border-line bg-surface p-4">
                <input type="radio" name="ruling" value={ch.label} className="size-5 shrink-0 accent-accent" />
                <span className="flex-1 text-sm text-fg">{ch.label}</span>
                <span className="w-[220px] text-right font-mono text-[11px] text-muted">{ch.effect}</span>
              </label>
            ))}
          </fieldset>
          <Field label={t.rationaleLabel} placeholder={t.rationalePlaceholder} rows={3} />
          <Notice title={t.finalNotice.title}>{t.finalNotice.body}</Notice>
        </Panel>
      </Split>
    </Workspace>
  );
}
