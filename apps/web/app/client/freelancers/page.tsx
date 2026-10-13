import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Button, Detail, Divider, Fact, Facts, Notice, PageHeading, Panel, Split, initialsOf } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { backedFreelancers, rules, short, usd } from "@/lib/data";

// CL-1 browse: freelancers with an open backing (named backer + cap).
export const dynamic = "force-dynamic";

export default async function BackedFreelancers() {
  const t = en.client.freelancers;
  const c = en.common;
  const [list, r] = await Promise.all([backedFreelancers(), rules()]);

  return (
    <Workspace role="client" active="/client/freelancers" crumb={[en.shell.nav.freelancers]}>
      <PageHeading eyebrow={fmt(c.eyebrow, { role: "CLIENT" })} title={t.title} subtitle={t.subtitle} />
      <Split
        side={
          <>
            <Panel side="info" title={t.protection.title}>
              <p className="text-lg font-medium leading-[1.3] text-bright">{t.protectionHeadline}</p>
              <p className="text-[13px] leading-[1.55] text-muted">{t.protectionBody}</p>
              <Divider />
              <Detail label={t.protectionLabels.trigger} value={t.protectionValues.trigger} />
              <Detail label={t.protectionLabels.decision} value={t.protectionValues.decision} />
              <Detail label={t.protectionLabels.cap} value={t.protectionValues.cap} />
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
            </Panel>
            <Notice title={t.premiumNotice.title}>{t.premiumNotice.body}</Notice>
            <Notice title={c.pilotBoundaries.title}>{c.pilotBoundaries.body}</Notice>
          </>
        }
      >
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] text-faint">{fmt(t.matches, { count: list.length })}</p>
        </div>
        {list.length === 0 && (
          <Panel dashed>
            <p className="text-sm text-fg">{en.client.actions.noFreelancers}</p>
          </Panel>
        )}
        {list.map((f) => {
          const free = f.backings.reduce((a, b) => a + (b.cap > b.locked ? b.cap - b.locked : 0n), 0n);
          return (
            <article key={f.ref} className="flex flex-col gap-4 rounded-xl border-[0.5px] border-line bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
                  <Avatar initials={initialsOf(f.name)} />
                  <div className="flex min-w-0 flex-col gap-[3px]">
                    <p className="text-[15px] font-medium text-bright">{f.name}</p>
                    <p className="font-mono text-[11px] text-faint">{short(f.ref)}</p>
                  </div>
                </div>
                {free > 0n ? (
                  <Button primary icon="arrow-right" href={`/client/new?ref=${f.ref}`}>{t.start}</Button>
                ) : (
                  <span className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-[13px] text-muted shadow-[inset_0_0_0_0.5px_theme(colors.line)]">{t.fullyCommitted}</span>
                )}
              </div>
              <Facts>
                <Fact label={t.backerLabel} value={f.backings.map((b) => b.voucherName).join(", ")} />
                <Fact label={t.freeCapLabel} value={<span className="font-mono">{`$${usd(free)} / $${usd(f.totalCap)}`}</span>} />
                <Fact label={t.deliveredLabel} value={f.paidDeliveries ? fmt(t.paidDeliveries, { count: f.paidDeliveries }) : t.noDeliveries} />
              </Facts>
            </article>
          );
        })}
      </Split>
    </Workspace>
  );
}
