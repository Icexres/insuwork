import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Button, Detail, Notice, PageHeading, Panel, Split, TextLink, initialsOf } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { BackForm } from "@/components/voucher-actions";
import { fmt } from "@/lib/demo";
import { readyApplicants, usd, viewer, voucherVault } from "@/lib/data";
import { startConversation } from "@/lib/message-actions";

// VO-2 detail. Advisory report only — never a credential (AGENTS.md rule 9).
export const dynamic = "force-dynamic";

export default async function ApplicantReport({ params }: { params: { id: string } }) {
  const t = en.voucher.report;
  const c = en.common;
  const v = await viewer();
  const [list, vault] = await Promise.all([readyApplicants(), v?.wallet ? voucherVault(v.wallet) : null]);
  const a = list.find((x) => x.id === params.id);
  const deposit = vault?.deposited ?? 0n, allocated = vault?.allocated ?? 0n, remaining = deposit - allocated;
  const report = (a?.report?.report ?? {}) as Record<string, unknown>;
  // summary is shown under the name; version/disclaimer are metadata. Arrays (strengths, concerns…) are joined.
  const entries = Object.entries(report)
    .filter(([k]) => !["summary", "version", "disclaimer", "evidence"].includes(k))
    .map(([k, val]) => [k.replace(/_/g, " ").toUpperCase(), Array.isArray(val) ? val.join(" · ") : String(val)] as [string, string]);
  const alreadyBacked = !!a?.freelancerRef && !!vault?.backings.some((b) => b.freelancer_ref === a.freelancerRef);
  const blocked = !a?.freelancerRef ? en.voucher.empty.noKyc : alreadyBacked ? en.voucher.live.alreadyBacked : null;

  return (
    <Workspace role="voucher" active="/voucher/applicants" crumb={[en.shell.nav.applicants, a?.name ?? ""]}>
      <TextLink href="/voucher/applicants">{t.allApplicants}</TextLink>
      {!a ? (
        <Panel dashed><p className="text-sm text-fg">{en.voucher.empty.notFound}</p></Panel>
      ) : (
        <>
          <PageHeading eyebrow={t.eyebrow} title={fmt(t.title, { name: a.name })} subtitle={t.subtitle}
            action={
              <form action={startConversation}>
                <input type="hidden" name="user" value={a.freelancer_user_id} />
                <Button submit icon="arrow-right">{fmt(en.messages.message, { name: a.name.split(" ")[0] })}</Button>
              </form>
            } />
          <Split
            sticky
            side={
              <Panel side="action" title={t.decision} badge={en.shell.envDevnet}>
                <Detail label={t.decisionLabels.deposit} value={`$${usd(deposit)}`} />
                <Detail label={t.decisionLabels.allocated} value={`$${usd(allocated)}`} />
                <Detail label={t.decisionLabels.remaining} value={`$${usd(remaining)}`} />
                {blocked ? (
                  <Notice title={blocked} />
                ) : !vault?.exists ? (
                  <Button href="/voucher" primary>{en.voucher.empty.createVault}</Button>
                ) : (
                  <div className="flex flex-col gap-3.5 border-t-[0.5px] border-line pt-3.5">
                    <Notice tone="risk" title={c.atRisk.title}>{c.atRisk.body}</Notice>
                    <BackForm freelancerRef={a.freelancerRef!} max={remaining.toString()} label={t.decisionLabels.cap} afterLabel={t.decisionLabels.after}
                      button={fmt(t.backButton, { name: a.name.split(" ")[0], cap: "" }).replace(/ · $/, "")} />
                  </div>
                )}
              </Panel>
            }
          >
            <Panel title={t.summary} badge={t.advisory}>
              <div className="flex items-start gap-4">
                <Avatar initials={initialsOf(a.name)} size={56} square />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="break-words text-[13px] text-muted">{[(a.skills as string[]).join(" · "), a.college, a.grad_year].filter(Boolean).join(" · ")}</p>
                  {a.report?.summary && <p className="text-pretty text-sm leading-relaxed text-fg">{a.report.summary}</p>}
                </div>
              </div>
              {entries.length > 0 && (
                <dl className="grid gap-[0.5px] overflow-hidden rounded-lg border-[0.5px] border-line bg-line [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
                  {entries.map(([label, value]) => (
                    <div key={label} className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-3.5">
                      <dt className="font-mono text-[10px] text-faint">{label}</dt>
                      <dd className="text-pretty text-[13px] leading-[1.55] text-fg">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Notice title={t.advisoryNotice.title}>{t.advisoryNotice.body}</Notice>
            </Panel>
          </Split>
        </>
      )}
    </Workspace>
  );
}
