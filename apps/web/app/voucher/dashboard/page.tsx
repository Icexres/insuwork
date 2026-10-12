import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Metrics, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { WithdrawForm } from "@/components/voucher-actions";
import { fmt } from "@/lib/demo";
import { pct, rules, short, usd, viewer, voucherVault } from "@/lib/data";

// VO-3 / VO-4. One vault per voucher, 1:1 leverage (AGENTS.md rules 4–5).
export const dynamic = "force-dynamic";

export default async function BondDashboard() {
  const t = en.voucher.dashboard;
  const c = en.common;
  const e = en.voucher.empty;
  const v = await viewer();
  const r = await rules();
  const d = v?.wallet ? await voucherVault(v.wallet) : null;
  const twoLine = (a: string, b: string) => (
    <span className="flex flex-col gap-1">
      <span className="text-[13px] text-fg">{a}</span>
      <span className="text-[11px] text-muted">{b}</span>
    </span>
  );

  return (
    <Workspace role="voucher" active="/voucher/dashboard" crumb={[en.shell.nav.dashboard]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })}
        title={fmt(t.title, { name: v?.name ?? "" })}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right" href={d?.exists ? "/voucher/applicants" : "/voucher"}>{d?.exists ? t.backFreelancer : e.createVault}</Button>}
      />
      {!d?.exists ? (
        <Panel><p className="text-sm text-muted">{v?.wallet ? e.noVault : e.noWallet}</p></Panel>
      ) : (
        <>
          <Metrics
            cards
            items={[
              { label: t.metrics.deposited, value: usd(d.deposited), note: `Vault ${short(d.address)} · DEVNET` },
              { label: t.metrics.allocated, value: usd(d.allocated), note: `${pct(d.allocated, d.deposited)}% of deposited capital` },
              { label: t.metrics.locked, value: usd(d.locked), note: `${pct(d.locked, d.deposited)}% of deposited capital` },
              { label: t.metrics.unallocated, value: usd(d.unallocated), note: t.metrics.withdrawable },
            ]}
          />
          <Split
            side={
              <>
                <Panel title={t.overview} badge={en.shell.envDevnet}>
                  <p className="text-[22px] font-medium leading-[1.2] text-white">{fmt(t.vault, { vault: short(d.address) })}</p>
                  <Detail label={t.bars.deposited} value={usd(d.deposited)} />
                  <Detail label={t.bars.allocated} value={usd(d.allocated)} />
                  <Detail label={t.bars.locked} value={usd(d.locked)} />
                  <Detail label={t.bars.unallocated} value={usd(d.unallocated)} />
                  <Detail label={t.premiumsEarned} value={usd(d.premiums)} />
                  <Detail label={t.claimsPaid} value={usd(d.claimsPaid)} />
                </Panel>
                <Panel title={t.withdraw} badge={`${usd(d.unallocated)} USDC`}>
                  <p className="text-[13px] text-muted">{t.withdrawBody}</p>
                  <WithdrawForm max={d.unallocated.toString()} mint={r.mint} label={t.withdrawAmount} button={t.withdrawButton} />
                </Panel>
              </>
            }
          >
            <Panel title={t.utilisation} badge={t.leverageBadge}>
              <p className="text-[13px] text-muted">{t.utilisationBody}</p>
              <div className="flex flex-wrap gap-3">
                {(["deposited", "allocated", "locked", "unallocated"] as const).map((k) => (
                  <div key={k} className="flex min-w-[120px] flex-1 flex-col gap-2 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted">{t.bars[k]}</span>
                      <span className="text-fg">{usd(d[k])}</span>
                    </div>
                    <div className="h-2 rounded-full bg-raised">
                      <div className="h-full rounded-full bg-edge" style={{ width: `${pct(d[k], d.deposited)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t.backings} badge={fmt(t.activeBadge, { count: d.backings.length })}>
              {d.backings.length === 0 ? (
                <p className="text-[13px] text-muted">{e.noBackings}</p>
              ) : (
                <DataTable
                  columns={t.backingColumns}
                  rows={d.backings.map((b) => [
                    twoLine(b.name, b.commitments.length ? b.commitments.map((x) => `${short(x.client)} · ${x.status}`).join(", ") : en.voucher.live.noCommitment),
                    twoLine(usd(b.cap), fmt(en.voucher.live.capOf, { locked: usd(b.locked), cap: usd(b.cap) })),
                    <span key="p" className="text-[13px] text-fg">{fmt(en.voucher.live.commitments, { count: b.active_commitments })}</span>,
                    twoLine(BigInt(b.locked) > 0n ? en.voucher.live.locked : en.voucher.live.open, ""),
                  ])}
                />
              )}
              <Detail label={t.totalPremiums} value={usd(d.premiums)} />
              <Detail label={t.claimsPaid} value={usd(d.claimsPaid)} />
            </Panel>
          </Split>
        </>
      )}
    </Workspace>
  );
}
