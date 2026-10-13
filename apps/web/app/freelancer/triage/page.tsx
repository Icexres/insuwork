import en from "@insuwork/shared/i18n/en.json";
import { MAX_TURNS } from "@insuwork/triage";
import { Button, Checklist, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { TriageChat } from "@/components/freelancer-forms";
import { fmt } from "@/lib/demo";
import { viewer } from "@/lib/data";
import { freelancerState } from "@/lib/freelancer";

// AI triage interview (T-27). Advisory only (AGENTS.md rule 9).
export const dynamic = "force-dynamic";

export default async function TriageInterview() {
  const t = en.freelancer.triage;
  const v = await viewer();
  if (!v) return null;
  const s = await freelancerState(v);
  const open = s.session && !s.session.ended_at ? s.session : null;
  const usedRetake = (s.app?.retakes_used ?? 0) >= 1;
  const canStart = !!s.app?.full_name && !!s.baseline && s.app.status !== "backed" && (s.sessionCount === 0 || !usedRetake);
  const turn = open ? open.transcript.filter((m) => m.role === "user").length : 0;
  const done = !!s.summary && !open;
  const at = done ? t.sectionList.length : Math.min(t.sectionList.length - 1, Math.floor((turn / MAX_TURNS) * t.sectionList.length));

  return (
    <Workspace role="freelancer" active="/freelancer/triage" crumb={[en.shell.nav.triage]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={t.title} subtitle={t.subtitle} />
      <Split
        side={
          <>
            <Panel side="action" title={t.sections} action={<span className="font-mono text-[11px] text-muted">{`${turn} / ~${MAX_TURNS}`}</span>}>
              <Checklist items={t.sectionList.map((label, i) => ({ label, state: i < at ? "done" : i === at && open ? "current" : "todo" }))} />
              <p className="text-xs text-faint">{t.duration}</p>
            </Panel>
            <Notice title={t.usageNotice.title}>{t.usageNotice.body} {t.neverAsk}</Notice>
            <Panel side="action" title={t.control} badge={usedRetake ? t.retakeUsed : t.retakeAvailable}>
              <p className="text-[13px] leading-[1.55] text-muted">{t.controlBody}</p>
              <div><Button href="/freelancer">{en.common.saveAndLeave}</Button></div>
            </Panel>
          </>
        }
      >
        <Panel title={en.freelancer.application.steps[3]} badge={t.advisoryBadge}>
          {done && (
            <Notice tone="positive" title={en.freelancer.flow.reviewTitle}>{s.summary!.summary}</Notice>
          )}
          <TriageChat
            key={open?.id ?? "new"}
            initial={open?.transcript ?? []}
            sessionId={open?.id ?? null}
            canStart={!open && canStart}
            maxTurns={MAX_TURNS}
            name={v.name.includes("@") ? en.shell.crumb.freelancer : v.name.split(" ")[0]}
          />
        </Panel>
      </Split>
    </Workspace>
  );
}
