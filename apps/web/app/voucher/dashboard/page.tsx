import en from "@insuwork/shared/i18n/en.json";
import { Bar, Button, Detail, Metrics, PageHeading, Pair, Panel, Row, RowList, Split, StatusDot } from "@/components/ui";
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
  const l = en.voucher.live;
  const v = await viewer();
  const r = await rules();
  const d = v?.wallet ? await voucherVault(v.wallet) : null;
  const first = v?.name && !v.name.includes("@") ? v.name.split(" ")[0] : "";

  return (
    <Workspace role="voucher" active="/voucher/dashboard" crumb={[en.shell.nav.dashboard]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "BACKER" })}
        title={first ? fmt(t.title, { name: first }) : en.shell.nav.vault}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right" href={d?.exists ? "/voucher/applicants" : "/voucher"}>{d?.exists ? t.backFreelancer : e.createVault}</Button>}
      />
      {!d?.exists ? (
        <Panel dashed><p className="text-sm text-fg">{v?.wallet ? e.noVault : e.noWallet}</p></Panel>
      ) : (
        <>
          <Metrics
            items={[
              { label: t.metrics.deposited, value: `$${usd(d.deposited)}`, note: `Vault ${short(d.address)} · DEVNET` },
              { label: t.metrics.allocated, value: `$${usd(d.allocated)}`, note: `${pct(d.allocated, d.deposited)}% of deposited capital` },
              { label: t.metrics.locked, value: `$${usd(d.locked)}`, note: `${pct(d.locked, d.deposited)}% of deposited capital` },
              { label: t.metrics.unallocated, value: `$${usd(d.unallocated)}`, note: t.metrics.withdrawable },
            ]}
          />
          <Split
            side={
              <>
                <Panel side="info" title={t.overview}>
                  <p className="mb-1 font-mono text-lg text-bright">{fmt(t.vault, { vault: short(d.address) })}</p>
                  <Detail label={t.bars.deposited} value={`$${usd(d.deposited)}`} />
                  <Detail label={t.bars.allocated} value={`$${usd(d.allocated)}`} />
                  <Detail label={t.bars.locked} value={`$${usd(d.locked)}`} />
                  <Detail label={t.bars.unallocated} value={`$${usd(d.unallocated)}`} />
                  <Detail label={t.premiumsEarned} value={`$${usd(d.premiums)}`} />
                  <Detail label={t.claimsPaid} value={`$${usd(d.claimsPaid)}`} />
                </Panel>
                <Panel side="action" title={t.withdraw} action={<span className="font-mono text-[11px] text-muted">{`$${usd(d.unallocated)}`}</span>}>
                  <p className="text-xs leading-[1.55] text-muted">{t.withdrawBody}</p>
                  <WithdrawForm max={d.unallocated.toString()} mint={r.mint} label={t.withdrawAmount} button={t.withdrawButton} />
                </Panel>
              </>
            }
          >
            <Panel title={t.utilisation} badge={t.leverageBadge}>
              <p className="text-[13px] leading-[1.55] text-muted">{t.utilisationBody}</p>
              <div role="img" aria-label={`${t.bars.allocated} ${pct(d.allocated, d.deposited)}%, ${t.bars.locked} ${pct(d.locked, d.deposited)}%`}
                className="relative h-3.5 overflow-hidden rounded-full bg-raised shadow-[inset_0_0_0_0.5px_theme(colors.edge)]">
                <div className="absolute inset-y-0 left-0 bg-muted transition-[width] duration-500" style={{ width: `${pct(d.allocated, d.deposited)}%` }} />
                <div className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500" style={{ width: `${pct(d.locked, d.deposited)}%` }} />
              </div>
              <div className="grid gap-x-4 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
                {([["locked", "bg-accent"], ["allocated", "bg-muted"], ["unallocated", "bg-raised"]] as const).map(([k, sw]) => (
                  <div key={k} className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <span className={`size-2 rounded-sm shadow-[inset_0_0_0_0.5px_theme(colors.edge)] ${sw}`} />
                      {t.bars[k]}
                    </span>
                    <span className="font-mono text-[13px] text-bright">{`$${usd(d[k])}`}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title={t.backings} badge={fmt(t.activeBadge, { count: d.backings.length })}>
              {d.backings.length === 0 ? (
                <p className="text-[13px] text-muted">{e.noBackings}</p>
              ) : (
                <RowList>
                  {d.backings.map((b) => {
                    const lockedB = BigInt(b.locked), cap = BigInt(b.cap);
                    return (
                      <Row key={b.pubkey} min="10rem">
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm text-bright">{b.name}</span>
                          <span className="truncate text-xs text-muted">
                            {b.commitments.length ? b.commitments.map((x) => `${short(x.client)} · ${x.status}`).join(", ") : l.noCommitment}
                          </span>
                        </span>
                        <span className="flex min-w-0 flex-col gap-1.5">
                          <span className="font-mono text-xs text-fg">{fmt(l.capOf, { locked: `$${usd(lockedB)}`, cap: `$${usd(cap)}` })}</span>
                          <Bar accent pct={pct(lockedB, cap)} />
                        </span>
                        <Pair mono top={fmt(l.commitments, { count: b.active_commitments })} />
                        <StatusDot tone={lockedB > 0n ? "accent" : "muted"}>{lockedB > 0n ? l.locked : l.open}</StatusDot>
                      </Row>
                    );
                  })}
                </RowList>
              )}
              <Detail label={t.totalPremiums} value={`$${usd(d.premiums)}`} />
              <Detail label={t.claimsPaid} value={`$${usd(d.claimsPaid)}`} />
            </Panel>
          </Split>
        </>
      )}
    </Workspace>
  );
}
