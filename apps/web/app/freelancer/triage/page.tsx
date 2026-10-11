import en from "@insuwork/shared/i18n/en.json";
import { MAX_TURNS } from "@insuwork/triage";
import { Badge, Button, Divider, Notice, PageHeading, Panel, Split, Steps } from "@/components/ui";
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

  return (
    <Workspace role="freelancer" active="/freelancer/triage" crumb={[en.shell.nav.triage]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={t.title} subtitle={t.subtitle} />
      <Split
        side={
          <>
            <Panel title={t.sections} badge={`${turn} / ~${MAX_TURNS}`}>
              <Steps steps={t.sectionList} current={Math.min(t.sectionList.length, Math.floor((turn / MAX_TURNS) * t.sectionList.length) + 1)} />
              <p className="text-xs text-muted">{t.duration}</p>
            </Panel>
            <Notice title={t.usageNotice.title}>{t.usageNotice.body}</Notice>
            <Panel title={t.control}>
              <p className="text-[13px] text-muted">{t.controlBody}</p>
              <div><Badge>{usedRetake ? t.retakeUsed : t.retakeAvailable}</Badge></div>
              <div><Button href="/freelancer">{en.common.saveAndLeave}</Button></div>
              <Divider />
              <p className="text-xs text-muted">{t.neverAsk}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.title} badge={t.advisoryBadge}>
          {s.summary && !open && <Notice title={en.freelancer.flow.reviewTitle}>{s.summary.summary}</Notice>}
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
