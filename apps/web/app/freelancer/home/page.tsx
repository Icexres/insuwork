import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, DataTable, Detail, Divider, Fact, Field, Lifecycle, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { backer, contract, fmt, freelancer, freelancerHome as d } from "@/lib/demo";

// Freelancer status page. Amounts in NPR only; no wallet, no crypto (AGENTS.md rule 1).
export default function FreelancerHome() {
  const t = en.freelancer.home;

  return (
    <Workspace role="freelancer" active="/freelancer/home" crumb={[en.shell.nav.home]}>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })}
        title={fmt(t.title, { name: freelancer.first })}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right">{fmt(t.viewDelivery, { milestone: d.currentMilestone })}</Button>}
      />
      <Lifecycle stages={contract.lifecycle} />
      <Metrics
        items={[
          { label: t.metrics.received, value: contract.receivedNpr, note: d.receivedNote },
          { label: t.metrics.estimate, value: contract.estimateNpr, note: d.estimateNote },
          { label: t.metrics.current, value: d.current, note: d.currentNote },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.backer}>
              <p className="text-xl font-medium leading-[1.2] text-white">{backer.name}</p>
              <p className="text-[13px] text-muted">{backer.home}</p>
              <p className="text-[13px] text-muted">{fmt(t.backerBody, { name: backer.first })}</p>
              <div><Button>{fmt(t.contactBacker, { name: backer.first })}</Button></div>
            </Panel>
            <Panel title={t.profile}>
              <p className="font-mono text-[11px] text-fg">{fmt(en.public.url, { ref: freelancer.ref })}</p>
              <div className="flex gap-2">
                <Button>{t.copyLink}</Button>
                <Button href={`/p/${freelancer.ref}`}>{t.open}</Button>
              </div>
              <p className="text-xs text-muted">{t.profileHint}</p>
              <div><Button>{t.revoke}</Button></div>
              <div><Badge>{t.revokeBadge}</Badge></div>
            </Panel>
            <Panel title={t.family} badge={d.familyBadge}>
              <p className="text-xs text-fg">{freelancer.family}</p>
              <p className="text-xs text-muted">{t.familyStatus}</p>
              <div><Button>{t.removeAccess}</Button></div>
              <Divider />
              <Field label={t.invite} placeholder={t.invitePlaceholder} />
              <div><Button>{t.inviteButton}</Button></div>
              <div><Badge>{t.limitBadge}</Badge></div>
            </Panel>
          </>
        }
      >
        <Panel title={fmt(t.contract, { client: contract.client })} badge={t.mockPayments}>
          <p className="text-[13px] text-muted">{contract.summary}</p>
          <DataTable
            columns={en.common.paymentColumns}
            rows={contract.milestones.map((m) => [m.work, m.due, m.npr, m.status])}
          />
          <Detail label={t.receivedSoFar} value={contract.receivedNpr} />
          <Notice title={d.reviewNotice.title}>{d.reviewNotice.body}</Notice>
          <p className="text-xs text-muted">{en.common.fxNote}</p>
        </Panel>
        <Panel title={t.journey}>
          <div className="flex flex-wrap gap-4">
            {d.journey.map((j) => (
              <Fact key={j.label} label={j.label} value={j.value} />
            ))}
          </div>
        </Panel>
      </Split>
    </Workspace>
  );
}
