import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Button, Detail, Divider, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { BackForm } from "@/components/voucher-actions";
import { fmt } from "@/lib/demo";
import { readyApplicants, usd, viewer, voucherVault } from "@/lib/data";

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
    .map(([k, val]) => [k.replace(/_/g, " "), Array.isArray(val) ? val.join(" · ") : String(val)] as [string, string]);
  const initials = (a?.name ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const alreadyBacked = !!a?.freelancerRef && !!vault?.backings.some((b) => b.freelancer_ref === a.freelancerRef);

  return (
    <Workspace role="voucher" active="/voucher/applicants" crumb={[en.shell.nav.applicants, a?.name ?? ""]}>
      {!a ? (
        <Panel><p className="text-sm text-muted">{en.voucher.empty.notFound}</p></Panel>
      ) : (
        <>
          <PageHeading eyebrow={fmt(c.eyebrow, { role: "VOUCHER" })} title={fmt(t.title, { name: a.name })} subtitle={t.subtitle} />
          <Split
            side={
              <Panel title={c.pilotBoundaries.title} badge={en.shell.envDevnet}>
                <p className="text-[13px] text-muted">{c.pilotBoundaries.body}</p>
              </Panel>
            }
          >
            <Panel title={t.summary} badge={t.advisory}>
              <div className="flex items-center gap-4">
                <Avatar initials={initials} size={56} square />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="text-[22px] font-medium leading-[1.2] text-white">{a.name}</p>
                  <p className="text-[13px] text-muted">{[(a.skills as string[]).join("/"), a.college, a.grad_year].filter(Boolean).join(" · ")}</p>
                  {a.report?.summary && <p className="text-[13px] text-muted">{a.report.summary}</p>}
                </div>
              </div>
              <Divider />
              {entries.map(([label, value]) => (
                <Detail key={label} label={label} value={value} />
              ))}
              <Notice title={t.advisoryNotice.title}>{t.advisoryNotice.body}</Notice>
            </Panel>
            <Panel title={t.decision} badge={en.shell.envDevnet}>
              <Detail label={t.decisionLabels.deposit} value={`$${usd(deposit)}`} />
              <Detail label={t.decisionLabels.allocated} value={`$${usd(allocated)}`} />
              <Detail label={t.decisionLabels.remaining} value={`$${usd(remaining)}`} />
              <Notice title={t.riskTitle}>{c.atRisk.body}</Notice>
              {!a.freelancerRef ? (
                <p className="text-[13px] text-muted">{en.voucher.empty.noKyc}</p>
              ) : alreadyBacked ? (
                <p className="text-[13px] text-muted">{en.voucher.live.alreadyBacked}</p>
              ) : !vault?.exists ? (
                <Button href="/voucher" primary>{en.voucher.empty.createVault}</Button>
              ) : (
                <BackForm freelancerRef={a.freelancerRef} max={remaining.toString()} label={t.decisionLabels.cap}
                  button={fmt(t.backButton, { name: a.name.split(" ")[0], cap: "" }).replace(/ · $/, "")} />
              )}
              <div><Button href="/voucher/applicants">{c.back}</Button></div>
            </Panel>
          </Split>
        </>
      )}
    </Workspace>
  );
}
