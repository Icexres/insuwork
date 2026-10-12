import { revalidatePath } from "next/cache";
import en from "@insuwork/shared/i18n/en.json";
import { Badge, Button, Detail, Notice, PageHeading, Panel } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { viewer } from "@/lib/data";
import { supabaseService } from "@/lib/supabase/server";

// E-51: after the interview the admin reviews the advisory report and marks the application ready or rejected.
// Advisory only (rule 9): this approves visibility to vouchers, it is not a credential.
export const dynamic = "force-dynamic";

async function decide(form: FormData) {
  "use server";
  const v = await viewer();
  if (v?.role !== "admin") return;
  const status = form.get("decision") === "ready" ? "ready" : "rejected";
  await supabaseService().from("applications").update({ status, updated_at: new Date().toISOString() })
    .eq("id", String(form.get("id"))).eq("status", "triage");
  revalidatePath("/admin/applications");
}

export default async function ApplicationReview() {
  const t = en.admin.applications;
  const db = supabaseService();
  const { data: apps } = await db.from("applications").select("id, freelancer_user_id, full_name, college, grad_year, skills, status, applicant_response, updated_at")
    .in("status", ["triage", "ready", "rejected", "backed"]).order("updated_at", { ascending: false }).limit(50);
  const ids = (apps ?? []).map((a) => a.id);
  const [{ data: reports }, { data: sessions }] = ids.length
    ? await Promise.all([
        db.from("triage_reports").select("application_id, summary, report").in("application_id", ids),
        db.from("triage_sessions").select("application_id, flagged, error, ended_at").in("application_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const list = (s: unknown) => ((s as string[] | undefined) ?? []).join(" · ") || "—";

  return (
    <Workspace role="admin" active="/admin/applications" crumb={[en.shell.nav.applications]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "OPERATOR" })} title={t.title} subtitle={t.subtitle} />
      {(apps ?? []).length === 0 && <Panel><p className="text-[13px] text-muted">{t.empty}</p></Panel>}
      {(apps ?? []).map((a) => {
        const rep = (reports ?? []).find((r) => r.application_id === a.id);
        const r = (rep?.report ?? {}) as Record<string, unknown>;
        const flagged = (sessions ?? []).some((s) => s.application_id === a.id && s.flagged);
        return (
          <Panel key={a.id} title={a.full_name ?? "—"} badge={a.status.toUpperCase()}>
            <p className="text-[13px] text-muted">{[(a.skills as string[]).join(" / "), a.college, a.grad_year].filter(Boolean).join(" · ")}</p>
            {flagged && <Notice title={t.flagged}>{t.flaggedBody}</Notice>}
            {rep ? (
              <>
                <p className="text-sm text-fg">{rep.summary}</p>
                <Detail label={t.strengths} value={list(r.strengths)} />
                <Detail label={t.concerns} value={list(r.concerns)} />
                <Detail label={t.communication} value={String(r.communication ?? "—")} />
                <Detail label={t.confidence} value={String(r.confidence ?? "—")} />
              </>
            ) : <p className="text-[13px] text-muted">{t.noReport}</p>}
            {a.applicant_response && <Notice title={t.response}>{a.applicant_response}</Notice>}
            {a.status === "triage" && rep && (
              <form action={decide} className="flex gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="decision" value="ready" />
                <Button primary submit icon="arrow-right">{t.approve}</Button>
              </form>
            )}
            {a.status === "triage" && (
              <form action={decide}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="decision" value="rejected" />
                <Button submit>{t.reject}</Button>
              </form>
            )}
            <div><Badge>{t.advisory}</Badge></div>
          </Panel>
        );
      })}
    </Workspace>
  );
}
