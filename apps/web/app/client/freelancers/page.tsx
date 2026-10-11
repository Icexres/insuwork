import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Button, Detail, Divider, Fact, Field, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { backedFreelancers as d, fmt, users, vault } from "@/lib/demo";

export default function BackedFreelancers() {
  const t = en.client.freelancers;
  const c = en.common;

  return (
    <Workspace role="client" active="/client/freelancers" crumb={[en.shell.nav.freelancers]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "CLIENT" })}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right" href="/client/new">{t.start}</Button>}
      />
      <Split
        side={
          <>
            <Panel title={users.client.name} badge={en.shell.envDevnet}>
              <p className="text-xl font-medium leading-[1.2] text-white">{d.client.treasury}</p>
              <p className="text-[13px] text-muted">{t.clientBody}</p>
              <Detail label={t.clientLabels.backer} value={d.client.backer} />
              <Detail label={t.clientLabels.cap} value={d.client.cap} />
              <Detail label={t.clientLabels.delivered} value={d.client.delivered} />
              <Detail label={t.clientLabels.exposure} value={d.client.exposure} />
              <div><Button>{t.openClient}</Button></div>
            </Panel>
            <Panel title={t.protection.title}>
              <p className="text-[22px] font-medium leading-[1.2] text-white">{t.protectionHeadline}</p>
              <p className="text-[13px] text-muted">{t.protectionBody}</p>
              <Divider />
              <Detail label={t.protectionLabels.trigger} value={t.protectionValues.trigger} />
              <Detail label={t.protectionLabels.decision} value={t.protectionValues.decision} />
              <Detail label={t.protectionLabels.cap} value={t.protectionValues.cap} />
              <Detail label={c.claimWindow} value={vault.rules.claimWindow} />
              <Notice title={t.premiumNotice.title}>{t.premiumNotice.body}</Notice>
            </Panel>
            <Panel title={c.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{c.pilotBoundaries.body}</p>
              <Detail label={t.boundaryLabels.eligibility} value={t.boundaryValues.eligibility} />
              <Detail label={t.boundaryLabels.counsel} value={t.boundaryValues.counsel} />
            </Panel>
          </>
        }
      >
        {/* ponytail: filters are static until the freelancer query exists. */}
        <Panel title={t.filters} badge={fmt(t.matches, { count: d.list.length })}>
          <Field label={t.search} placeholder={t.searchPlaceholder} />
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">{t.stack}</p>
            <div className="flex flex-wrap gap-2">
              {d.stacks.map((s) => (
                <Button key={s}>{s}</Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Field label={t.backer} value={d.client.backer} />
            <Field label={t.cap} placeholder={t.capPlaceholder} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">{t.delivered}</p>
            <div className="flex flex-wrap gap-2">
              {t.deliveryFilters.map((f) => (
                <Button key={f}>{f}</Button>
              ))}
            </div>
          </div>
        </Panel>
        {d.list.map((f, i) => (
          <section key={f.name} className="flex flex-col gap-4 rounded-xl border-[0.5px] border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar initials={f.initials} />
                <div className="flex flex-col gap-1">
                  <p className="text-base font-medium text-white">{f.name}</p>
                  <p className="text-[13px] text-muted">{f.sub}</p>
                </div>
              </div>
              <Button primary={i === 0} icon={i === 0 ? "arrow-right" : undefined} href="/client/new">
                {t.start}
              </Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Fact label={t.backerLabel} value={f.backer} />
                <p className="text-[13px] text-muted">{f.backerNote}</p>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Fact label={t.deliveredLabel} value={f.delivered} />
                <p className="text-[13px] text-muted">{f.deliveredNote}</p>
              </div>
            </div>
            <Notice title={t.protection.title}>{t.protection.body}</Notice>
          </section>
        ))}
      </Split>
    </Workspace>
  );
}
