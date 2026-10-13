import en from "@insuwork/shared/i18n/en.json";
import { Detail, Divider, Notice, PageHeading, Panel, Split } from "@/components/ui";
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
  const notes = [v?.wallet ? short(v.wallet) : "—", v?.wallet ? "SIWS" : "—", vault?.exists ? short(vault.address) : "—", vault?.exists ? `$${usd(vault.deposited)}` : "—"];

  return (
    <Workspace role="voucher" active="/voucher" crumb={[en.shell.nav.vault]}>
      <PageHeading eyebrow={fmt(c.eyebrow, { role: "BACKER" })} title={en.shell.nav.vault} subtitle={t.subtitle} />
      <ol className="grid grid-cols-1 gap-[0.5px] overflow-hidden rounded-xl border-[0.5px] border-line bg-line min-[440px]:grid-cols-2 xl:grid-cols-4">
        {t.steps.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "now" : "todo";
          return (
            <li key={label} aria-current={state === "now" ? "step" : undefined} className={`flex min-w-0 items-center gap-3 px-[18px] py-4 ${state === "now" ? "bg-raised" : "bg-surface"}`}>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                state === "now" ? "text-accent shadow-[inset_0_0_0_1px_theme(colors.accent)]" : state === "done" ? "text-bright shadow-[inset_0_0_0_1px_theme(colors.muted)]" : "text-faint shadow-[inset_0_0_0_1px_theme(colors.edge)]"
              }`}>
                {state === "done" ? "✓" : String(n).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={`text-[13px] ${state === "todo" ? "text-muted" : "text-bright"}`}>{label}</span>
                <span className="break-words font-mono text-[11px] text-faint">{notes[i]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <Split
        side={
          <>
            <Panel side="info" title={t.how}>
              <p className="text-xl font-medium leading-[1.25] text-bright">{t.invariant}</p>
              <p className="text-[13px] leading-[1.55] text-muted">{t.invariantBody}</p>
              <Divider />
              <Detail label={t.ruleLabels.leverage} value="1 : 1" />
              <Detail label={t.ruleLabels.premium} value={`${r.premiumBps / 100}% · client-paid`} />
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
              <Detail label={c.panelRuling} value={`${r.rulingDays} days`} />
            </Panel>
            <Notice title={t.withdrawNotice.title}>{t.withdrawNotice.body}</Notice>
            <Notice title={c.pilotBoundaries.title}>{t.eligibility}</Notice>
          </>
        }
      >
        <Panel title={t.fund} badge={fmt(t.stepOf, { n: step })}>
          {!v?.wallet || !vault ? (
            <p className="text-sm text-muted">{en.voucher.empty.noWallet}</p>
          ) : (
            <>
              <p className="text-[13px] leading-[1.55] text-muted">
                {vault.exists ? fmt(t.intro, { vault: short(vault.address), min: usd(r.minBond) }) : en.voucher.empty.createVault}
              </p>
              <Detail label={t.labels.balance} value={`${usd(balance)} USDC`} />
              <Detail label={en.voucher.dashboard.metrics.deposited} value={usd(vault.deposited)} />
              <Detail label={t.labels.min} value={`${usd(r.minBond)} USDC`} />
              <Notice tone="risk" title={c.atRisk.title}>{c.atRisk.body}</Notice>
              <DepositForm vaultExists={vault.exists} minBond={r.minBond.toString()} mint={r.mint} balance={balance.toString()} label={t.amount}
                afterLabel={t.labels.after} button={vault.exists ? en.voucher.live.depositButton : en.voucher.empty.createVault} />
            </>
          )}
        </Panel>
      </Split>
    </Workspace>
  );
}
