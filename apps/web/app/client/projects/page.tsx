import { redirect } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { Button, CardLink, Field, FieldRow, PageHeading, Panel, Split, StatusDot } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { parseUsd, usd, viewer } from "@/lib/data";
import { supabaseServer } from "@/lib/supabase/server";
import { myProjects, projectStatus } from "@/lib/projects";

// E-59: private project briefs. Not a job board: freelancers never see these (IDEA §1.5).
export const dynamic = "force-dynamic";

async function createProject(form: FormData) {
  "use server";
  const v = await viewer();
  if (v?.role !== "client") return;
  const title = String(form.get("title") ?? "").trim();
  const brief = String(form.get("brief") ?? "").trim();
  const budgetText = String(form.get("budget") ?? "").trim();
  const budget = budgetText ? parseUsd(budgetText) : null;
  const err = title.length < 3 || title.length > 120 ? "title" : brief.length < 20 || brief.length > 4000 ? "brief" : budgetText && !budget ? "budget" : "";
  if (err) redirect(`/client/projects?e=${err}`);
  const { data, error } = await supabaseServer().from("projects").insert({
    title, brief, budget: budget?.toString() ?? null, deadline: String(form.get("deadline") ?? "") || null,
    skills: String(form.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
  }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/client/projects/${data.id}`);
}

export default async function Projects({ searchParams }: { searchParams: { e?: string } }) {
  const t = en.client.projects;
  const list = await myProjects();
  const e = searchParams.e;

  return (
    <Workspace role="client" active="/client/projects" crumb={[en.shell.nav.projects]}>
      <PageHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} />
      <Split
        sticky
        side={
          <Panel side="action" title={t.newTitle}>
            <form action={createProject} className="flex flex-col gap-4">
              <Field label={t.fields.title} name="title" placeholder={t.placeholders.title} maxLength={120} error={e === "title" ? t.errTitle : undefined} />
              <Field label={t.fields.brief} name="brief" rows={6} placeholder={t.placeholders.brief} maxLength={4000} error={e === "brief" ? t.errBrief : undefined} />
              <Field label={t.fields.skills} name="skills" placeholder={t.placeholders.skills} />
              <FieldRow min="9rem">
                <Field label={t.fields.budget} name="budget" prefix="$" inputMode="decimal" placeholder="1500" error={e === "budget" ? t.errBudget : undefined} />
                <Field label={t.fields.deadline} name="deadline" type="date" />
              </FieldRow>
              <p className="text-xs leading-normal text-faint">{t.private}</p>
              <Button submit primary large icon="arrow-right">{t.create}</Button>
            </form>
          </Panel>
        }
      >
        {list.length === 0 ? (
          <Panel dashed><p className="text-sm text-fg">{t.none}</p></Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((p) => {
              const s = projectStatus(p);
              return (
                <CardLink key={p.id} href={`/client/projects/${p.id}`} min="12rem" highlight={s === "shortlisted"}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[15px] font-medium text-bright">{p.title}</span>
                    <span className="line-clamp-2 text-xs leading-normal text-muted">{p.brief}</span>
                  </span>
                  <span className="flex flex-col gap-1 font-mono text-xs text-fg">
                    {p.budget && <span>{fmt(t.budget, { amount: `$${usd(p.budget)}` })}</span>}
                    {p.plan.length > 0 && <span className="text-muted">{fmt(t.planTotal, { n: p.plan.length, amount: `$${p.plan.reduce((a, m) => a + m.amountUsd, 0).toLocaleString("en-US")}` })}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-3">
                    <StatusDot tone={s === "committed" ? "idle" : s === "brief" ? "muted" : "accent"}>{t.status[s]}</StatusDot>
                    <span className="whitespace-nowrap text-[13px] text-fg">{en.common.open}</span>
                  </span>
                </CardLink>
              );
            })}
          </div>
        )}
        <Panel title={t.how.title}>
          <ol className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
            {t.how.steps.map((s, i) => (
              <li key={s} className="flex gap-2.5 text-[13px] leading-normal text-fg">
                <span className="font-mono text-[11px] leading-5 text-faint">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
        </Panel>
      </Split>
    </Workspace>
  );
}
