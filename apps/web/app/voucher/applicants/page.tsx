import en from "@insuwork/shared/i18n/en.json";
import { Avatar, CardLink, PageHeading, Panel, StatusDot, initialsOf } from "@/components/ui";
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
  const statusLabel = (s: string) => t.statusLabels[s as keyof typeof t.statusLabels] ?? s;

  return (
    <Workspace role="voucher" active="/voucher/applicants" crumb={[en.shell.nav.applicants]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "BACKER" })}
        title={t.title}
        subtitle={t.subtitle}
        action={
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs text-muted">{t.metrics.remaining}</span>
            <span className="font-mono text-xl text-bright">{`$${usd(remaining)}`}</span>
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] leading-[1.55] text-muted">{t.reportsBody}</p>
          <span className="font-mono text-[11px] text-faint">{fmt(t.reportsBadge, { count: list.length })}</span>
        </div>
        {list.length === 0 && (
          <Panel dashed><p className="text-sm text-fg">{en.voucher.empty.noApplicants}</p></Panel>
        )}
        {list.map((a) => (
          <CardLink key={a.id} href={`/voucher/applicants/${a.id}`} min="12rem" highlight={a.status === "ready"}>
            <span className="flex min-w-0 items-center gap-3">
              <Avatar square initials={initialsOf(a.name)} />
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="text-[15px] font-medium text-bright">{a.name}</span>
                <span className="break-words text-xs text-muted">{[(a.skills as string[]).join(" · "), a.college].filter(Boolean).join(" · ")}</span>
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-[3px]">
              <span className="font-mono text-[10px] text-faint">{t.columns[1].toUpperCase()}</span>
              <span className="line-clamp-3 text-[13px] leading-[1.45] text-fg">{summary(a.report?.report ?? null, "background")}</span>
            </span>
            <span className="flex min-w-0 flex-col gap-[3px]">
              <span className="font-mono text-[10px] text-faint">{t.columns[2].toUpperCase()}</span>
              <span className="line-clamp-3 text-[13px] leading-[1.45] text-fg">{summary(a.report?.report ?? null, "communication")}</span>
            </span>
            <span className="flex items-center justify-between gap-3">
              <StatusDot tone={a.status === "ready" ? "accent" : "muted"}>{statusLabel(a.status)}</StatusDot>
              <span className="whitespace-nowrap text-[13px] text-fg">{c.review}</span>
            </span>
          </CardLink>
        ))}
      </div>
      <Panel title={t.guidance}>
        <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          {t.guidanceSteps.map((s, i) => (
            <li key={s} className="flex gap-2.5 text-[13px] leading-normal text-fg">
              <span className="font-mono text-[11px] leading-5 text-faint">{String(i + 1).padStart(2, "0")}</span>
              {fmt(s, { rate: premium })}
            </li>
          ))}
        </ol>
        <p className="text-xs leading-[1.55] text-faint">
          {fmt(t.capacityNotice.body, { deposit: `$${usd(deposit)}`, remaining: `$${usd(remaining)}` })}
        </p>
      </Panel>
    </Workspace>
  );
}
