import en from "@insuwork/shared/i18n/en.json";
import { Badge, Detail, Metrics, Notice, PageHeading, Panel } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { AssignPanelForm, FinalizeButton } from "@/components/dispute-actions";
import { fmt } from "@/lib/demo";
import { short, usd } from "@/lib/data";
import { adminOverview, allClaims } from "@/lib/disputes";

// AD-1 / AD-2: claims queue. Panels are admin-assigned (E-35); votes are binary (OQ-3).
export const dynamic = "force-dynamic";

const day = (ts: number) => (ts ? new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function ClaimsQueue() {
  const t = en.admin.claims;
  const x = en.disputes;
  const [claims, o] = await Promise.all([allClaims(), adminOverview()]);
  const active = o.panelists.filter((p) => p.active);
  const now = Date.now() / 1000;
  const filed = claims.filter((c) => c.status === "filed");
  const voting = claims.filter((c) => c.status === "panelAssigned");

  return (
    <Workspace role="admin" active="/admin/claims" crumb={[t.crumb]}>
      <PageHeading eyebrow={t.eyebrow} title={t.title} subtitle={x.queueSubtitle} />
      <Metrics
        items={[
          { label: t.metrics.open, value: String(filed.length + voting.length), note: fmt(x.unassigned, { count: filed.length }) },
          { label: t.metrics.voting, value: String(voting.length), note: t.metrics.votingNote },
          { label: t.metrics.ruling, value: `${o.disputes.rulingDays} days`, note: t.metrics.rulingNote },
          { label: x.finalized, value: String(claims.length - filed.length - voting.length), note: "" },
        ]}
      />
      {claims.length === 0 && <Panel><p className="text-[13px] text-muted">{x.noClaims}</p></Panel>}
      {claims.map((c) => {
        const votes = c.panel.filter((m) => m.vote).length;
        const majority = c.panel.filter((m) => m.vote === "upheld").length >= 2 || c.panel.filter((m) => m.vote === "rejected").length >= 2;
        return (
          <Panel key={c.address} title={`${short(c.address)} · M${c.index + 1}`} badge={c.status === "finalized" ? c.outcome.toUpperCase() : c.status.toUpperCase()}>
            <Detail label={x.client} value={c.client} />
            <Detail label={x.freelancer} value={c.freelancer} />
            <Detail label={t.activeLabels.amount} value={`$${usd(c.amount)} · ${usd(c.locked)} ${x.lockedLabel}`} />
            <Detail label={t.activeLabels.filed} value={day(c.filedTs)} />
            {c.status !== "filed" && <Detail label={x.deadline} value={day(c.deadline)} />}
            {c.panel.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {c.panel.map((m) => <Badge key={m.wallet}>{`${m.name} · ${m.vote ?? x.pending}`}</Badge>)}
              </div>
            )}
            {c.status === "filed" && (active.length >= 3
              ? <AssignPanelForm commitment={c.commitment} index={c.index} panelists={active.map((p) => ({ wallet: p.wallet, name: p.name }))} />
              : <Notice title={x.needPanelists}>{x.needPanelistsBody}</Notice>)}
            {c.status === "panelAssigned" && (majority || now > c.deadline) && <FinalizeButton commitment={c.commitment} index={c.index} />}
            {c.status === "panelAssigned" && !majority && <p className="text-xs text-muted">{fmt(x.votesIn, { count: votes })}</p>}
          </Panel>
        );
      })}
      <Notice title={t.integrity}>{t.integrityBody}</Notice>
    </Workspace>
  );
}
