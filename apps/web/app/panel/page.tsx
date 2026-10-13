import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Badge, Detail, Divider, Fact, Facts, PageHeading, Panel, Split } from "@/components/ui";
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
  const todo = claims.filter((c) => c.status === "panelAssigned" && !mine(c)?.vote).length;
  const now = Date.now() / 1000;

  return (
    <Workspace role="panel" active="/panel" crumb={[en.shell.nav.assignedClaims]} counts={{ "/panel": todo }}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "PANELIST" })} title={t.title} subtitle={t.subtitle} />
      <Split
        side={
          <>
            <Panel side="info" title={t.voting}>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-bright">{x.upheld}</span>
                <span className="text-xs leading-normal text-muted">{x.upheldEffect}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-bright">{x.rejected}</span>
                <span className="text-xs leading-normal text-muted">{x.rejectedEffect}</span>
              </div>
              <Divider />
              <p className="text-xs leading-[1.55] text-faint">{t.pseudonymNotice.body}</p>
            </Panel>
            <Panel side="info" title={t.overview}>
              <Detail label={t.overviewLabels.panelist} value={v?.name ?? "—"} />
              <Detail label={t.overviewLabels.wallet} value={v?.wallet ? short(v.wallet) : "—"} />
              <Detail label={t.overviewLabels.assigned} value={String(claims.length)} />
              <Detail label={t.overviewLabels.window} value={`${r.rulingDays} days`} />
              <p className="text-xs text-faint">{x.unpaid}</p>
            </Panel>
          </>
        }
      >
        {claims.length === 0 && (
          <Panel dashed><p className="text-sm text-fg">{v?.wallet ? x.noAssigned : en.voucher.empty.noWallet}</p></Panel>
        )}
        {claims.map((c) => {
          const open = c.status === "panelAssigned";
          const voted = !!mine(c)?.vote;
          const needsMe = open && !voted;
          const days = Math.max(0, Math.ceil((c.deadline - now) / 86400));
          return (
            <Link key={c.address} href={`/panel/claims/${c.address}`}
              className={`flex flex-col gap-4 rounded-xl border-[0.5px] bg-surface p-5 transition-colors duration-150 hover:border-muted hover:bg-[#121314] ${needsMe ? "border-edge" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2.5">
                  <Badge>{short(c.address)}</Badge>
                  <span className="text-base font-medium text-bright">{`M${c.index + 1} · ${c.client}`}</span>
                </div>
                <span className={`inline-flex items-center gap-2 font-mono text-[11px] ${needsMe ? "text-bright" : "text-muted"}`}>
                  <span className={`size-1.5 rounded-full ${needsMe ? "bg-accent" : "bg-edge"}`} />
                  {open ? (voted ? x.youVoted : t.notVoted) : c.outcome.toUpperCase()}
                </span>
              </div>
              <Facts min="8rem">
                <Fact mono label={l.filed} value={day(c.filedTs)} />
                <Fact mono label={l.stake} value={`$${usd(c.amount)}`} />
                <Fact mono label={l.deadline} value={
                  <span className={open && days <= 2 ? "text-danger" : ""}>{open ? fmt(t.daysLeft, { date: day(c.deadline), days }) : day(c.deadline)}</span>
                } />
                <Fact mono label={t.votes} value={fmt(t.votesOf, { count: c.panel.filter((m) => m.vote).length })} />
              </Facts>
              <span className={`self-start text-[13px] ${needsMe ? "text-accent" : "text-muted"}`}>{needsMe ? t.reviewClaim : t.viewClaim}</span>
            </Link>
          );
        })}
      </Split>
    </Workspace>
  );
}
