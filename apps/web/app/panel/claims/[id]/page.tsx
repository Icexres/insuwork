import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Badge, Detail, Eyebrow, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { FinalizeButton, VoteForm } from "@/components/dispute-actions";
import { short, usd, viewer } from "@/lib/data";
import { claimView } from "@/lib/disputes";
import { fmt } from "@/lib/demo";

// PA-1 claim review: spec, evidence statement, panel, vote (binary, OQ-3), finalize.
export const dynamic = "force-dynamic";

const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function ClaimReview({ params }: { params: { id: string } }) {
  const t = en.panel.review;
  const x = en.disputes;
  const [v, c] = await Promise.all([viewer(), claimView(params.id)]);
  const me = c?.panel.find((m) => m.wallet === v?.wallet);
  if (!c || !me) {
    return (
      <Workspace role="panel" active="/panel" crumb={[t.crumb]}>
        <Panel><p className="text-sm text-muted">{en.voucher.empty.notFound}</p></Panel>
      </Workspace>
    );
  }
  const majority = ["upheld", "rejected"].some((o) => c.panel.filter((m) => m.vote === o).length >= 2);
  const canFinalize = c.status === "panelAssigned" && (majority || Date.now() / 1000 > c.deadline);

  return (
    <Workspace role="panel" active="/panel" crumb={[t.crumb, short(c.address)]}>
      <PageHeading eyebrow={t.eyebrow} title={fmt(t.title, { id: short(c.address) })} subtitle={`${c.client} · M${c.index + 1} · ${c.freelancer}`} />
      <Metrics
        cards
        items={[
          { label: t.metrics.id, value: short(c.address), note: day(c.filedTs) },
          { label: t.metrics.client, value: c.client, note: `M${c.index + 1}` },
          { label: t.metrics.freelancer, value: short(c.freelancerRef), note: t.metrics.freelancerNote },
          { label: t.metrics.locked, value: `$${usd(c.locked)}`, note: `$${usd(c.amount)} ${x.milestoneLabel}` },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.members} badge={fmt(x.votesIn, { count: c.panel.filter((m) => m.vote).length })}>
              {c.panel.map((m) => (
                <div key={m.wallet} className="flex items-center gap-3">
                  <Avatar initials={m.name.slice(0, 2).toUpperCase()} size={36} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-medium text-fg">{m.wallet === v?.wallet ? `${m.name} · ${x.you}` : m.name}</p>
                    <p className="font-mono text-[11px] text-muted">{short(m.wallet)}</p>
                  </div>
                  <Badge>{m.vote ? (m.wallet === v?.wallet ? m.vote : x.voted) : t.memberPending}</Badge>
                </div>
              ))}
            </Panel>
            <Panel title={t.fees}>
              <Detail label={en.common.wallet} value={short(me.wallet)} />
              <Detail label={t.feeLabels.claimFee} value={`$${usd(c.claimFee)}`} />
              <Detail label={x.deadline} value={day(c.deadline)} />
              <p className="text-xs text-muted">{x.unpaid}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.overview} badge={c.status === "finalized" ? c.outcome.toUpperCase() : t.pending}>
          <div className="flex flex-col gap-1.5 rounded-lg border-[0.5px] border-line bg-surface p-4">
            <Eyebrow>{x.spec}</Eyebrow>
            <p className="whitespace-pre-wrap text-sm text-fg">{c.spec ?? x.noSpec}</p>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border-[0.5px] border-line bg-surface p-4">
            <Eyebrow>{t.clientEvidence}</Eyebrow>
            <p className="whitespace-pre-wrap text-sm text-fg">{c.evidence ?? x.noEvidence}</p>
            <p className="font-mono text-[11px] text-faint">{`sha256 ${short(c.evidenceHash)}`}</p>
          </div>
        </Panel>
        <Panel title={t.rationale}>
          {c.status === "panelAssigned" && !me.vote && <VoteForm commitment={c.commitment} index={c.index} />}
          {me.vote && <p className="text-[13px] text-muted">{fmt(x.yourVote, { vote: me.vote })}</p>}
          {canFinalize && <FinalizeButton commitment={c.commitment} index={c.index} />}
          <Notice title={t.finalNotice.title}>{t.finalNotice.body}</Notice>
        </Panel>
      </Split>
    </Workspace>
  );
}
