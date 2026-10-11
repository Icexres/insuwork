import en from "@insuwork/shared/i18n/en.json";
import { Detail, Divider, Notice, PageHeading, Panel, Split, Steps } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { DepositForm } from "@/components/voucher-actions";
import { fmt } from "@/lib/demo";
import { rules, short, usd, usdcBalance, viewer, voucherVault } from "@/lib/data";

// VO-1: connect → bind (SIWS, wallet layout) → create vault → deposit. One vault per voucher, 1:1 (rules 4–5).
export const dynamic = "force-dynamic";

export default async function VaultSetup() {
  const t = en.voucher.setup;
  const c = en.common;
  const v = await viewer();
  const r = await rules();
  const vault = v?.wallet ? await voucherVault(v.wallet) : null;
  const balance = v?.wallet ? await usdcBalance(v.wallet) : 0n;
  const step = !v?.wallet ? 1 : !vault?.exists ? 3 : 4;

  return (
    <Workspace role="voucher" active="/voucher" crumb={[en.shell.nav.vault]}>
      <PageHeading eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })} title={t.title} subtitle={t.subtitle} />
      <Steps steps={t.steps} current={step} horizontal />
      <Split
        side={
          <>
            <Panel title={t.how}>
              <p className="text-[22px] font-medium leading-[1.2] text-white">{t.invariant}</p>
              <p className="text-[13px] text-muted">{t.invariantBody}</p>
              <Divider />
              <Detail label={t.ruleLabels.leverage} value="1 : 1" />
              <Detail label={t.ruleLabels.premium} value={`${r.premiumBps / 100}% · client-paid`} />
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
              <Detail label={c.panelRuling} value={`${r.rulingDays} days`} />
            </Panel>
            <Notice title={t.withdrawNotice.title}>{t.withdrawNotice.body}</Notice>
            <Panel title={c.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{c.pilotBoundaries.body}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.fund} badge={t.stepBadge}>
          {!v?.wallet || !vault ? (
            <p className="text-sm text-muted">{en.voucher.empty.noWallet}</p>
          ) : (
            <>
              <p className="text-sm text-muted">
                {vault.exists ? fmt(t.intro, { vault: short(vault.address), min: usd(r.minBond) }) : en.voucher.empty.createVault}
              </p>
              <Detail label={t.labels.balance} value={`${usd(balance)} USDC`} />
              <Detail label={en.voucher.dashboard.metrics.deposited} value={usd(vault.deposited)} />
              <Detail label={t.labels.min} value={`${usd(r.minBond)} USDC`} />
              <Notice title={c.atRisk.title}>{c.atRisk.body}</Notice>
              <DepositForm vaultExists={vault.exists} minBond={r.minBond.toString()} mint={r.mint} label={t.amount}
                button={vault.exists ? en.voucher.live.depositButton : en.voucher.empty.createVault} />
            </>
          )}
        </Panel>
        <Panel title={t.prereqs}>
          <Detail label={t.prereqLabels.ownership} value={v?.wallet ? short(v.wallet) : "—"} />
          <Detail label={t.prereqLabels.vault} value={vault?.exists ? `${short(vault.address)} · DEVNET` : "—"} />
          <p className="text-xs text-muted">{t.eligibility}</p>
        </Panel>
      </Split>
    </Workspace>
  );
}
