import en from "@insuwork/shared/i18n/en.json";
import { DataTable, Detail, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { AddPanelistForm, PanelistActiveToggle, PauseToggle, SetOracleForm, SetTreasuryForm } from "@/components/dispute-actions";
import { fmt } from "@/lib/demo";
import { short, usd, viewer } from "@/lib/data";
import { adminOverview } from "@/lib/disputes";

// AD-1 / AD-2: live configs, MOCK partner, oracle, panelist allowlist, all commitments. Payout partner is
// MOCK and labelled so (rule 10). Every change is a wallet tx signed by the config admin.
export const dynamic = "force-dynamic";

export default async function OperatorConfiguration() {
  const t = en.admin.config;
  const p = t.programFields;
  const x = en.disputes;
  const [v, d] = await Promise.all([viewer(), adminOverview()]);
  const isAdminWallet = v?.wallet === d.admin;

  return (
    <Workspace role="admin" active="/admin" crumb={[t.crumb]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "OPERATOR" })} title={t.title} subtitle={t.subtitle} />
      {!isAdminWallet && <Notice title={x.notAdminTitle}>{fmt(x.notAdminBody, { admin: short(d.admin) })}</Notice>}
      <Split
        side={
          <>
            <Panel title={t.sidebar} badge={en.shell.envDevnet}>
              <Detail label={t.sidebarFields.wallet} value={v?.wallet ? short(v.wallet) : "—"} />
              <Detail label={x.configAdmin} value={short(d.admin)} />
              <Detail label={t.sidebarFields.treasury} value={short(d.escrow.treasury)} />
              <Detail label={t.sidebarFields.network} value="devnet" />
            </Panel>
            <Panel title={t.allowlist} badge={fmt(t.members, { count: d.panelists.length })}>
              <ul className="flex flex-col gap-3">
                {d.panelists.map((m) => (
                  <li key={m.wallet} className="flex flex-col gap-2 rounded-md border-[0.5px] border-line bg-surface p-3">
                    <p className="text-[13px] font-medium text-fg">{m.name}</p>
                    <p className="font-mono text-[11px] text-muted">{`${short(m.wallet)} · ${m.active ? x.active : x.inactive} · ${m.voted}/${m.assigned} ${x.voted}`}</p>
                    {isAdminWallet && <PanelistActiveToggle wallet={m.wallet} active={m.active} />}
                  </li>
                ))}
              </ul>
              {isAdminWallet && <AddPanelistForm />}
              <p className="text-xs text-muted">{x.unpaid}</p>
            </Panel>
            <Panel title={en.common.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{en.common.pilotBoundaries.body}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.program} badge={en.shell.envDevnet}>
          <p className="text-sm text-muted">{t.programBody}</p>
          <Detail label={p.minBond} value={usd(d.bond.minBond)} />
          <Detail label={p.leverage} value="1 : 1" />
          <Detail label={p.premium} value={`${d.escrow.premiumBps / 100}%`} />
          <Detail label={p.fee} value={`${d.escrow.feeBps / 100}%`} />
          <Detail label={x.share} value={`${d.escrow.shareBps / 100}%`} />
          <Detail label={p.claimWindow} value={`${d.escrow.claimWindowDays} days`} />
          <Detail label={p.ruling} value={`${d.disputes.rulingDays} days`} />
          <Detail label={x.claimFee} value={usd(d.disputes.claimFee)} />
          <Detail label={x.cancelTerms} value={`${d.escrow.cancelFeeBps / 100}% / ${d.escrow.withdrawPenaltyBps / 100}%`} />
          <Notice title={t.assumptions.title}>{t.assumptions.body}</Notice>
        </Panel>
        <Panel title={x.pause}>
          {(["bond", "escrow", "disputes"] as const).map((prog) => (
            <div key={prog} className="flex flex-wrap items-center justify-between gap-4">
              <Detail label={prog} value={d.paused[prog] ? x.paused : x.live} />
              {isAdminWallet && <PauseToggle program={prog} paused={d.paused[prog]} />}
            </div>
          ))}
        </Panel>
        <Panel title={t.partner} badge={en.mock.badge}>
          {d.partners.map((pt) => (
            <div key={pt.wallet} className="flex flex-col gap-2">
              <Detail label={t.partnerFields.name} value={`${pt.name}${pt.isMock ? " · MOCK" : ""}`} />
              <Detail label={t.partnerFields.wallet} value={short(pt.wallet)} />
              <Detail label={x.status} value={pt.active ? x.active : x.inactive} />
            </div>
          ))}
        </Panel>
        <Panel title={t.oracle} badge={t.oracleBadge}>
          <Detail label={t.oracleFields.name} value={short(d.escrow.oracle)} />
          {isAdminWallet && <SetOracleForm current={d.escrow.oracle} />}
        </Panel>
        <Panel title={x.treasury} badge="OQ-6 · E-54">
          <p className="text-sm text-muted">{x.treasuryBody}</p>
          <Detail label="escrow" value={short(d.escrow.treasury)} />
          <Detail label="disputes" value={short(d.disputes.treasury)} />
          {isAdminWallet && <SetTreasuryForm program="escrow" current={d.escrow.treasury} mint={d.bond.mint} />}
          {isAdminWallet && <SetTreasuryForm program="disputes" current={d.disputes.treasury} mint={d.bond.mint} />}
        </Panel>
        <Panel title={x.allCommitments} badge={String(d.commitments.length)}>
          <DataTable
            columns={[x.commitment, x.client, en.client.new.totals.fund, en.client.commitment.metrics.released, x.status]}
            rows={d.commitments.map((c) => [short(c.pubkey), short(c.client), usd(c.total_required), usd(c.released), c.status])}
          />
        </Panel>
      </Split>
    </Workspace>
  );
}
