import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Badge, Detail, Metrics, Notice, PageHeading, Panel, Split, TextLink, initialsOf } from "@/components/ui";
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
      <Workspace role="panel" active="/panel" crumb={[en.shell.nav.assignedClaims, t.crumb]}>
        <TextLink href="/panel">{t.all}</TextLink>
        <Panel dashed><p className="text-sm text-fg">{en.voucher.empty.notFound}</p></Panel>
      </Workspace>
    );
  }
  const majority = ["upheld", "rejected"].some((o) => c.panel.filter((m) => m.vote === o).length >= 2);
  const canFinalize = c.status === "panelAssigned" && (majority || Date.now() / 1000 > c.deadline);
  const canVote = c.status === "panelAssigned" && !me.vote;
  const votesIn = c.panel.filter((m) => m.vote).length;

  return (
    <Workspace role="panel" active="/panel" crumb={[en.shell.nav.assignedClaims, short(c.address)]}>
      <TextLink href="/panel">{t.all}</TextLink>
      <PageHeading eyebrow={fmt(t.eyebrow, { id: short(c.address) })} title={fmt(t.title, { id: short(c.address) })} subtitle={`${c.client} · M${c.index + 1} · ${c.freelancer}`} />
      <Metrics
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
            <Panel side="action" title={t.members} action={<span className="font-mono text-[11px] text-muted">{fmt(t.votesIn, { count: votesIn })}</span>}>
              {c.panel.map((m) => (
                <div key={m.wallet} className="flex items-center gap-3">
                  <Avatar initials={initialsOf(m.name)} size={34} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-[13px] text-bright">{m.wallet === v?.wallet ? `${m.name} · ${t.you}` : m.name}</p>
                    <p className="font-mono text-[11px] text-faint">{short(m.wallet)}</p>
                  </div>
                  <Badge>{m.vote ? (m.wallet === v?.wallet || c.status === "finalized" ? m.vote.toUpperCase() : x.voted.toUpperCase()) : t.memberPending}</Badge>
                </div>
              ))}
            </Panel>
            <Panel side="info" title={t.fees}>
              <Detail label={en.common.wallet} value={short(me.wallet)} />
              <Detail label={t.feeLabels.claimFee} value={`$${usd(c.claimFee)}`} />
              <Detail label={x.deadline} value={day(c.deadline)} />
              <p className="text-xs text-faint">{x.unpaid}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.overview}>
          <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4 shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
            <p className="font-mono text-[10px] text-muted">{t.spec}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{c.spec ?? x.noSpec}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg bg-canvas p-4 shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
            <p className="font-mono text-[10px] text-muted">{t.clientEvidence}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{c.evidence ?? x.noEvidence}</p>
            <p className="break-all font-mono text-[11px] text-faint">{`sha256 ${short(c.evidenceHash)}`}</p>
          </div>
        </Panel>
        <Panel title={x.ruling} highlight={canVote}
          badge={c.status === "finalized" ? c.outcome.toUpperCase() : majority ? t.majority : t.pending}>
          {canVote && <VoteForm commitment={c.commitment} index={c.index} />}
          {me.vote && <p className="text-sm leading-[1.55] text-fg">{fmt(x.yourVote, { vote: me.vote })}</p>}
          {canFinalize && (
            <div className="flex flex-col items-start gap-2.5 border-t-[0.5px] border-line pt-3">
              <FinalizeButton commitment={c.commitment} index={c.index} />
            </div>
          )}
          <Notice title={t.finalNotice.title}>{t.finalNotice.body}</Notice>
        </Panel>
      </Split>
    </Workspace>
  );
}
