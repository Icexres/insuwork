import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Badge, Button, Detail, Notice, PageHeading, Panel, Split, StatusDot, TextLink, initialsOf } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { AssistButton } from "@/components/project-actions";
import { fmt } from "@/lib/demo";
import { backedFreelancers, usd } from "@/lib/data";
import { startConversation } from "@/lib/message-actions";
import { myProject, projectStatus } from "@/lib/projects";

// E-59: brief → AI milestone plan → AI shortlist → message / start a commitment with the plan prefilled.
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Panel header right side: an optional mono note, then the ADVISORY badge. */
const Aside = ({ note }: { note?: string | false | null }) => (
  <span className="flex items-center gap-3">
    {note && <span className="font-mono text-[11px] text-muted">{note}</span>}
    <Badge>{en.client.projects.advisory}</Badge>
  </span>
);

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const t = en.client.projects;
  const p = await myProject(params.id);
  if (!p) {
    return (
      <Workspace role="client" active="/client/projects" crumb={[en.shell.nav.projects]}>
        <TextLink href="/client/projects">{t.all}</TextLink>
        <Panel dashed><p className="text-sm text-fg">{en.voucher.empty.notFound}</p></Panel>
      </Workspace>
    );
  }
  const people = p.shortlist?.candidates.length ? await backedFreelancers() : [];
  const planTotal = p.plan.reduce((a, m) => a + m.amountUsd, 0);
  const status = projectStatus(p);

  return (
    <Workspace role="client" active="/client/projects" crumb={[en.shell.nav.projects, p.title]}>
      <TextLink href="/client/projects">{t.all}</TextLink>
      <PageHeading eyebrow={t.eyebrow} title={p.title} subtitle={t.private}
        action={<StatusDot tone={status === "committed" ? "idle" : "accent"}>{t.status[status]}</StatusDot>} />
      {p.commitment && (
        <Notice tone="positive" title={t.committed}>
          <TextLink href={`/client/commitments/${p.commitment}`}>{`${t.viewCommitment} →`}</TextLink>
        </Notice>
      )}
      <Split
        side={
          <>
            <Panel side="info" title={t.brief}>
              <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-fg">{p.brief}</p>
              {p.skills.length > 0 && <Detail label={t.labels.skills} value={<span className="font-sans text-[13px]">{p.skills.join(", ")}</span>} />}
              {p.budget && <Detail label={t.labels.budget} value={`$${usd(p.budget)}`} />}
              {p.deadline && <Detail label={t.labels.deadline} value={day(p.deadline)} />}
            </Panel>
            <Notice title={t.advisory}>{t.advisoryNote}</Notice>
          </>
        }
      >
        <Panel title={t.plan}
          action={<Aside note={p.plan.length > 0 && fmt(t.planTotal, { n: p.plan.length, amount: `$${planTotal.toLocaleString("en-US")}` })} />}>
          {p.plan.length === 0 ? (
            <p className="text-[13px] leading-[1.55] text-muted">{t.planEmpty}</p>
          ) : (
            <ol className="flex flex-col overflow-hidden rounded-lg border-[0.5px] border-line [&>li+li]:border-t-[0.5px] [&>li+li]:border-line">
              {p.plan.map((m, i) => (
                <li key={i} className="flex flex-col gap-2.5 px-4 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-sm font-medium text-bright"><span className="mr-2 font-mono text-[11px] text-faint">{`M${i + 1}`}</span>{m.title}</span>
                    <span className="font-mono text-xs text-fg">{`$${m.amountUsd.toLocaleString("en-US")} · ${day(m.due)}`}</span>
                  </div>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] text-faint">{t.deliverables.toUpperCase()}</span>
                      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-fg">{m.deliverables}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] text-faint">{t.acceptance.toUpperCase()}</span>
                      <p className="whitespace-pre-wrap text-[13px] leading-[1.5] text-fg">{m.acceptance}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!p.commitment && <AssistButton project={p.id} step="plan" primary={!p.plan.length}>{p.plan.length ? t.planRedraft : t.planDraft}</AssistButton>}
        </Panel>

        <Panel title={t.shortlist}
          action={<Aside note={p.shortlist && fmt(t.matchedAt, { date: new Date(p.shortlist.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) })} />}>
          {!p.shortlist ? (
            <p className="text-[13px] leading-[1.55] text-muted">{t.shortlistEmpty}</p>
          ) : p.shortlist.candidates.length === 0 ? (
            <p className="text-[13px] leading-[1.55] text-muted">{t.noMatches}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {p.shortlist.candidates.map((c, i) => {
                const f = people.find((x) => x.ref === c.id);
                if (!f) return null; // backing closed since the ranking
                const free = f.backings.reduce((a, b) => a + (b.cap > b.locked ? b.cap - b.locked : 0n), 0n);
                return (
                  <li key={c.id} className="flex flex-col gap-3.5 rounded-[10px] border-[0.5px] border-line bg-canvas p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                        <Avatar initials={initialsOf(f.name)} size={36} />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-[15px] font-medium text-bright">{f.name}</span>
                          <span className="font-mono text-[11px] text-muted">
                            {[fmt(t.cover, { amount: `$${usd(free)}` }), fmt(t.deliveries, { count: f.paidDeliveries })].join(" · ")}
                          </span>
                        </div>
                      </div>
                      <StatusDot tone={c.fit === "partial" ? "muted" : "accent"}>{t.fit[c.fit]}</StatusDot>
                    </div>
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-[1.5] text-fg">
                      {c.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    <p className="text-[13px] leading-[1.5] text-muted"><span className="font-mono text-[10px] text-faint">{`${t.ask.toUpperCase()} · `}</span>{c.ask}</p>
                    <div className="flex flex-wrap gap-2">
                      <form action={startConversation}>
                        <input type="hidden" name="ref" value={c.id} />
                        <input type="hidden" name="project" value={p.id} />
                        <Button submit>{t.message}</Button>
                      </form>
                      {!p.commitment && free > 0n && (
                        <Button primary icon="arrow-right" href={`/client/new?project=${p.id}&ref=${c.id}`}>{t.start}</Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {!p.commitment && <AssistButton project={p.id} step="match" primary={!!p.plan.length && !p.shortlist}>{p.shortlist ? t.rematch : t.match}</AssistButton>}
        </Panel>
      </Split>
    </Workspace>
  );
}
