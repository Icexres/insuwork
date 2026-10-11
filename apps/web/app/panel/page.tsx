import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, Fact, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { rules, short, usd, viewer } from "@/lib/data";
import { panelClaims } from "@/lib/disputes";

// PA-1: claims assigned to the signed-in panelist's wallet. Panelists are unpaid in v1 (OQ-14).
export const dynamic = "force-dynamic";

const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function AssignedClaims() {
  const t = en.panel.claims;
  const l = t.labels;
  const x = en.disputes;
  const v = await viewer();
  const [claims, r] = await Promise.all([v?.wallet ? panelClaims(v.wallet) : [], rules()]);
  const mine = (c: (typeof claims)[number]) => c.panel.find((m) => m.wallet === v?.wallet);
  const open = claims.filter((c) => c.status === "panelAssigned");

  return (
    <Workspace role="panel" active="/panel" crumb={[en.shell.nav.assignedClaims]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "PANELIST" })} title={t.title} subtitle={t.subtitle} />
      <Split
        side={
          <>
            <Panel title={t.overview}>
              <Fact mono label={t.overviewLabels.panelist} value={v?.name ?? "—"} />
              <Fact mono label={t.overviewLabels.wallet} value={v?.wallet ? short(v.wallet) : "—"} />
              <Fact mono label={t.overviewLabels.assigned} value={String(claims.length)} />
              <Fact mono label={t.overviewLabels.window} value={`${r.rulingDays} days`} />
            </Panel>
            <Panel title={t.voting}>
              <Fact mono label={x.upheld} value={x.upheldEffect} />
              <Fact mono label={x.rejected} value={x.rejectedEffect} />
              <Notice title={t.pseudonymNotice.title}>{t.pseudonymNotice.body}</Notice>
            </Panel>
            <Notice title={en.common.pilotBoundaries.title}>{en.common.pilotBoundaries.body}</Notice>
          </>
        }
      >
        <Panel title={t.queue} badge={fmt(t.assignedBadge, { count: open.length })}>
          <p className="text-[13px] text-muted">{t.queueBody}</p>
          {claims.length === 0 && <p className="text-[13px] text-muted">{v?.wallet ? x.noAssigned : en.voucher.empty.noWallet}</p>}
          {claims.map((c) => (
            <div key={c.address} className="flex flex-col gap-4 rounded-md border-[0.5px] border-line bg-canvas p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Badge>{short(c.address)}</Badge>
                  <p className="text-[17px] font-medium text-fg">{`M${c.index + 1} · ${c.client}`}</p>
                </div>
                <Badge>{c.status === "finalized" ? c.outcome.toUpperCase() : mine(c)?.vote ? x.youVoted : t.notVoted}</Badge>
              </div>
              <div className="flex flex-wrap gap-4">
                <Fact mono label={l.filed} value={day(c.filedTs)} />
                <Fact mono label={l.stake} value={`$${usd(c.amount)}`} />
                <Fact mono label={l.deadline} value={day(c.deadline)} />
              </div>
              <div><Button primary icon="arrow-right" href={`/panel/claims/${c.address}`}>{t.reviewClaim}</Button></div>
            </div>
          ))}
        </Panel>
      </Split>
    </Workspace>
  );
}
