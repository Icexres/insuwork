import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, Check, Detail, Divider, Field, Notice, PageHeading, Panel, Split, Steps } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, vault as d } from "@/lib/demo";

// Vault setup, step 4 (deposit). Wallet connect + SDK deposit get wired in the backend pass.
export default function VaultSetup() {
  const t = en.voucher.setup;
  const c = en.common;

  return (
    <Workspace role="voucher" active="/voucher" crumb={[en.shell.nav.vault]}>
      <PageHeading eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })} title={t.title} subtitle={t.subtitle} />
      <Steps steps={t.steps} current={4} horizontal />
      <Split
        side={
          <>
            <Panel title={t.how}>
              <p className="text-[22px] font-medium leading-[1.2] text-white">{t.invariant}</p>
              <p className="text-[13px] text-muted">{t.invariantBody}</p>
              <Divider />
              <Detail label={t.ruleLabels.leverage} value={d.rules.leverage} />
              <Detail label={t.ruleLabels.premium} value={d.rules.premium} />
              <Detail label={c.claimWindow} value={d.rules.claimWindow} />
              <Detail label={c.panelRuling} value={d.rules.ruling} />
            </Panel>
            <Notice title={t.withdrawNotice.title}>{t.withdrawNotice.body}</Notice>
            <Panel title={c.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{c.pilotBoundaries.body}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.fund} badge={t.stepBadge}>
          <p className="text-sm text-muted">{fmt(t.intro, { vault: d.address, min: d.minDeposit })}</p>
          <Field label={t.amount} value={d.deposited} />
          <div className="flex gap-2">
            {d.presets.map((p) => (
              <Button key={p}>{p}</Button>
            ))}
          </div>
          <Divider />
          <Detail label={t.labels.balance} value={d.walletBalance} />
          <Detail label={t.labels.after} value={d.afterDeposit} />
          <Detail label={t.labels.min} value={`${d.minDeposit} USDC`} />
          <Detail label={c.networkFee} value={d.networkFee} />
          <Notice title={c.atRisk.title}>{c.atRisk.body}</Notice>
          <Check defaultChecked>{c.riskAck}</Check>
          <div className="flex justify-between">
            <Button>{c.back}</Button>
            <Button primary icon="arrow-right">{fmt(t.deposit, { amount: d.depositAmount })}</Button>
          </div>
        </Panel>
        <Panel title={t.prereqs}>
          <Detail label={t.prereqLabels.ownership} value={d.prereqs.ownership} />
          <Detail label={t.prereqLabels.vault} value={d.prereqs.vault} />
          <Detail label={t.prereqLabels.kyc} value={d.prereqs.kyc} />
          <p className="text-xs text-muted">{t.eligibility}</p>
        </Panel>
      </Split>
    </Workspace>
  );
}
