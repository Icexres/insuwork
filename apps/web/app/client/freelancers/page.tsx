import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Button, Detail, Divider, Fact, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { backedFreelancers, clientCommitments, rules, short, usd, viewer } from "@/lib/data";

// CL-1 browse: freelancers with an open backing (named backer + cap).
export const dynamic = "force-dynamic";

export default async function BackedFreelancers() {
  const t = en.client.freelancers;
  const c = en.common;
  const v = await viewer();
  const [list, r, mine] = await Promise.all([backedFreelancers(), rules(), v?.wallet ? clientCommitments(v.wallet) : []]);
  const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

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
            <Panel title={v?.name ?? ""} badge={en.shell.envDevnet}>
              <p className="text-xl font-medium leading-[1.2] text-white">{v?.wallet ? short(v.wallet) : "—"}</p>
              <p className="text-[13px] text-muted">{t.clientBody}</p>
              <Detail label={t.clientLabels.exposure} value={fmt(en.voucher.live.commitments, { count: mine.filter((x) => x.status === "active" || x.status === "funded").length })} />
              <div><Button href="/client/commitments">{en.shell.nav.commitments}</Button></div>
            </Panel>
            <Panel title={t.protection.title}>
              <p className="text-[22px] font-medium leading-[1.2] text-white">{t.protectionHeadline}</p>
              <p className="text-[13px] text-muted">{t.protectionBody}</p>
              <Divider />
              <Detail label={t.protectionLabels.trigger} value={t.protectionValues.trigger} />
              <Detail label={t.protectionLabels.decision} value={t.protectionValues.decision} />
              <Detail label={t.protectionLabels.cap} value={t.protectionValues.cap} />
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
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
        <Panel title={t.title} badge={fmt(t.matches, { count: list.length })}>
          {list.length === 0 && <p className="text-[13px] text-muted">{en.client.actions.noFreelancers}</p>}
        </Panel>
        {list.map((f, i) => (
          <section key={f.ref} className="flex flex-col gap-4 rounded-xl border-[0.5px] border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar initials={initials(f.name)} />
                <div className="flex flex-col gap-1">
                  <p className="text-base font-medium text-white">{f.name}</p>
                  <p className="font-mono text-[11px] text-muted">{short(f.ref)}</p>
                </div>
              </div>
              <Button primary={i === 0} icon={i === 0 ? "arrow-right" : undefined} href={`/client/new?ref=${f.ref}`}>
                {t.start}
              </Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex flex-1 flex-col gap-2">
                <Fact label={t.backerLabel} value={f.backings.map((b) => b.voucherName).join(", ")} />
                <p className="text-[13px] text-muted">{`$${usd(f.totalCap)} cap`}</p>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Fact label={t.deliveredLabel} value={fmt(t.paidDeliveries, { count: f.paidDeliveries })} />
              </div>
            </div>
            <Notice title={t.protection.title}>{t.protection.body}</Notice>
          </section>
        ))}
      </Split>
    </Workspace>
  );
}
