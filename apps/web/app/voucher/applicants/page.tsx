import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, Detail, Metrics, Notice, PageHeading, Panel } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { readyApplicants, rules, usd, viewer, voucherVault } from "@/lib/data";

// VO-2 list: applicants with a finished (advisory) triage report.
export const dynamic = "force-dynamic";

export default async function Applicants() {
  const t = en.voucher.applicants;
  const c = en.common;
  const v = await viewer();
  const r = await rules();
  const [vault, list] = await Promise.all([v?.wallet ? voucherVault(v.wallet) : null, readyApplicants()]);
  const deposit = vault?.deposited ?? 0n, allocated = vault?.allocated ?? 0n, remaining = deposit - allocated;
  const premium = `${r.premiumBps / 100}%`;
  const summary = (rep: unknown, key: string) => (rep as Record<string, string> | null)?.[key] ?? "—";

  return (
    <Workspace role="voucher" active="/voucher/applicants" crumb={[en.shell.nav.applicants]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button href="/voucher/dashboard">{t.viewCapacity}</Button>}
      />
      <Metrics
        items={[
          { label: t.metrics.remaining, value: `$${usd(remaining)}`, note: t.metrics.remainingNote },
          { label: t.metrics.allocated, value: `$${usd(allocated)}`, note: fmt(en.voucher.live.commitments, { count: vault?.backings.length ?? 0 }) },
          { label: t.metrics.deposit, value: `$${usd(deposit)}`, note: "DEVNET" },
          { label: t.metrics.premium, value: premium, note: t.metrics.premiumNote },
        ]}
      />
      <Panel title={t.reports} badge={fmt(t.reportsBadge, { count: list.length })}>
        <p className="text-[13px] text-muted">{t.reportsBody}</p>
        {list.length === 0 ? (
          <p className="text-[13px] text-muted">{en.voucher.empty.noApplicants}</p>
        ) : (
          <DataTable
            columns={t.columns}
            rows={list.map((a) => [
              <span key="n" className="flex flex-col gap-1">
                <span className="text-sm font-medium text-fg">{a.name}</span>
                <span className="text-[13px] text-muted">{[(a.skills as string[]).join(" · "), a.college].filter(Boolean).join(" · ")}</span>
              </span>,
              summary(a.report?.report ?? null, "background"),
              summary(a.report?.report ?? null, "communication"),
              a.status,
              <Button key="b" href={`/voucher/applicants/${a.id}`}>{t.review}</Button>,
            ])}
          />
        )}
      </Panel>
      <Panel title={t.guidance}>
        <Detail label={t.guidanceLabels.allocation} value={t.yourDecision} />
        <Detail label={t.guidanceLabels.premium} value={fmt(t.premiumOnSuccess, { rate: premium })} />
        <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
        <Detail label={c.panelRuling} value={`${r.rulingDays} days`} />
        <p className="text-xs text-muted">{t.guidanceNote}</p>
        <Notice title={t.capacityNotice.title}>
          {fmt(t.capacityNotice.body, { deposit: `$${usd(deposit)}`, remaining: `$${usd(remaining)}` })}
        </Notice>
      </Panel>
    </Workspace>
  );
}
