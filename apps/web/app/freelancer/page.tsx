import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Choice, Detail, Divider, Field, FieldRow, Notice, PageHeading, Panel, Steps } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { KycForm } from "@/components/freelancer-forms";
import { fmt } from "@/lib/demo";
import { viewer } from "@/lib/data";
import { freelancerState } from "@/lib/freelancer";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";

// Onboarding stepper (UX-FLOWS freelancer 1): Profile → Portfolio & GitHub → Baseline → Triage → MOCK KYC → Done.
export const dynamic = "force-dynamic";

const list = (s: FormDataEntryValue | null) => String(s ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

async function saveProfile(form: FormData) {
  "use server";
  const v = await viewer();
  if (v?.role !== "freelancer" || form.get("consent") !== "on") return;
  const supabase = supabaseServer();
  await supabase.from("profiles").update({ display_name: String(form.get("display_name") ?? "").trim() || null }).eq("id", v.id);
  const row = {
    full_name: String(form.get("full_name") ?? "").trim(), college: String(form.get("college") ?? "").trim(),
    grad_year: Number(form.get("grad_year")) || null, skills: list(form.get("skills")), intro: String(form.get("intro") ?? "").trim(),
  };
  const { data: app } = await supabase.from("applications").select("id").eq("freelancer_user_id", v.id).maybeSingle();
  // RLS: owners may write only while the application is a draft
  if (app) await supabase.from("applications").update({ ...row, updated_at: new Date().toISOString() }).eq("id", app.id);
  else await supabase.from("applications").insert(row);
  revalidatePath("/freelancer");
  redirect("/freelancer?step=2");
}

async function savePortfolio(form: FormData) {
  "use server";
  const v = await viewer();
  if (v?.role !== "freelancer") return;
  await supabaseServer().from("applications").update({
    portfolio_urls: list(form.get("portfolio_urls")).filter((u) => /^https?:\/\//.test(u)),
    github_handle: String(form.get("github_handle") ?? "").replace(/^@/, "").trim() || null, updated_at: new Date().toISOString(),
  }).eq("freelancer_user_id", v.id);
  redirect("/freelancer?step=3");
}

async function saveBaseline(form: FormData) {
  "use server";
  const v = await viewer();
  if (v?.role !== "freelancer") return;
  const yes = (k: string) => form.get(k) === "yes";
  await supabaseServer().from("application_baselines").upsert({
    freelancer_user_id: v.id, open_test_or_consultancy: yes("open"), noc_filed: yes("noc"), consultancy_deposit_paid: yes("deposit"),
  });
  redirect("/freelancer/triage");
}

async function saveResponse(form: FormData) {
  "use server";
  const v = await viewer();
  if (v?.role !== "freelancer") return;
  // response is allowed after drafting ends, so it goes through the service client scoped to the owner
  await supabaseService().from("applications").update({ applicant_response: String(form.get("response") ?? "").slice(0, 600) || null })
    .eq("freelancer_user_id", v.id);
  revalidatePath("/freelancer");
}

export default async function FreelancerApplication({ searchParams }: { searchParams: { step?: string } }) {
  const t = en.freelancer.application;
  const x = en.freelancer.flow;
  const f = t.fields;
  const v = await viewer();
  if (!v) return null;
  const s = await freelancerState(v);
  const a = s.app;
  const derived = !a?.full_name ? 1 : !a.portfolio_urls.length && !a.github_handle ? 2 : !s.baseline ? 3
    : !s.summary ? 4 : a.status === "ready" && !s.kyc ? 5 : a.status === "ready" || a.status === "backed" ? 6 : 4;
  const editable = !a || a.status === "draft";
  const step = editable && Number(searchParams.step) >= 1 && Number(searchParams.step) <= 3 ? Number(searchParams.step) : derived;
  const yesNo: [string, string][] = [["no", x.no], ["yes", x.yes]];
  const bool = (b: boolean | undefined) => (b ? "yes" : "no");
  const links = t.steps.map((_, i) => (editable && i < 3 && i + 1 <= derived ? `/freelancer?step=${i + 1}` : null));
  const badge = fmt(x.stepBadge, { n: step });
  const nav = (back: string | null, label: string) => (
    <div className="flex flex-wrap justify-between gap-3 pt-1">
      {back ? <Button large href={back}>{en.common.back}</Button> : <span />}
      <Button large primary icon="arrow-right" submit>{label}</Button>
    </div>
  );

  return (
    <Workspace role="freelancer" active="/freelancer" crumb={[en.shell.nav.application]}>
      <PageHeading eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} />
      <div className="flex flex-wrap items-start gap-8">
        <div className="hidden w-[240px] shrink-0 flex-col gap-5 md:sticky md:top-[84px] md:flex">
          <Steps steps={t.steps} current={step} links={links} />
          <Notice title={t.paceNotice.title}>{t.paceNotice.body}</Notice>
        </div>
        <div className="flex min-w-0 flex-[999_1_30rem] flex-col gap-5">
          <div className="flex flex-col gap-2.5 md:hidden">
            <div className="flex justify-between gap-3 font-mono text-[11px] text-muted">
              <span>{fmt(x.stepBadge, { n: step })}</span>
              <span className="text-fg">{t.steps[step - 1]}</span>
            </div>
            <div className="grid grid-cols-6 gap-1">
              {t.steps.map((label, i) => (
                <span key={label} className={`h-1 rounded-sm ${i + 1 === step ? "bg-accent" : i + 1 < step ? "bg-muted" : "bg-line"}`} />
              ))}
            </div>
          </div>

          {step === 1 && (
            <form action={saveProfile}>
              <Panel title={t.panel} badge={badge}>
                <p className="text-[13px] leading-[1.55] text-muted">{t.intro}</p>
                <FieldRow min="15rem">
                  <Field label={f.fullName} name="full_name" value={a?.full_name ?? ""} />
                  <Field label={f.displayName} name="display_name" value={v.name.includes("@") ? "" : v.name} />
                  <Field label={f.college} name="college" value={a?.college ?? ""} placeholder="Pulchowk Campus" />
                  <Field label={f.gradYear} name="grad_year" value={a?.grad_year?.toString() ?? ""} inputMode="numeric" maxLength={4} placeholder="2026" />
                </FieldRow>
                <Field label={f.stack} name="skills" value={a?.skills.join(", ") ?? ""} placeholder="React, TypeScript, Node" />
                <Field label={f.bio} name="intro" value={a?.intro ?? ""} rows={3} maxLength={280} />
                <Divider />
                <Check name="consent" defaultChecked={!!a}>{t.consent}</Check>
                {nav(null, t.continue)}
              </Panel>
            </form>
          )}
          {step === 1 && <Notice title={t.guaranteeNotice.title}>{t.guaranteeNotice.body}</Notice>}
          {step === 2 && (
            <form action={savePortfolio}>
              <Panel title={t.steps[1]} badge={badge}>
                <p className="text-[13px] leading-[1.55] text-muted">{x.portfolioBody}</p>
                <Field label={x.portfolio} name="portfolio_urls" value={a?.portfolio_urls.join("\n") ?? ""} rows={4} placeholder="https://…" mono />
                <Field label={x.github} name="github_handle" value={a?.github_handle ?? ""} placeholder="username" prefix="github.com/" />
                {nav("/freelancer?step=1", x.continueBaseline)}
              </Panel>
            </form>
          )}
          {step === 3 && (
            <form action={saveBaseline}>
              <Panel title={t.steps[2]} badge={badge}>
                <p className="text-[13px] leading-[1.55] text-muted">{x.baselineBody}</p>
                {([["open", x.baselineOpen, s.baseline?.open_test_or_consultancy], ["noc", x.baselineNoc, s.baseline?.noc_filed], ["deposit", x.baselineDeposit, s.baseline?.consultancy_deposit_paid]] as const).map(([name, label, val]) => (
                  <fieldset key={name} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-[0.5px] border-line pt-4">
                    <legend className="float-left max-w-[44ch] text-sm leading-normal text-fg">{label}</legend>
                    <Choice name={name} label={label} options={yesNo} defaultValue={bool(val)} />
                  </fieldset>
                ))}
                {nav("/freelancer?step=2", x.continueTriage)}
              </Panel>
            </form>
          )}
          {step === 4 && (
            <Panel title={t.steps[3]} badge={badge}>
              {s.summary ? (
                <>
                  <div className="flex flex-col gap-1.5 rounded-lg bg-white/[0.025] px-4 py-3.5 shadow-[inset_0_0_0_0.5px_theme(colors.line)]">
                    <p className="font-mono text-[11px] text-muted">{x.summaryEyebrow}</p>
                    <p className="text-pretty text-sm leading-relaxed text-fg">{s.summary.summary}</p>
                  </div>
                  <p className="text-xs text-faint">{x.reviewBody}</p>
                  <form action={saveResponse} className="flex flex-col gap-3">
                    <Field label={x.response} name="response" value={a?.applicant_response ?? ""} rows={3} maxLength={600} placeholder={x.responsePlaceholder} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {a && a.retakes_used < 1 ? <Button href="/freelancer/triage">{x.retake}</Button> : <span />}
                      <Button large primary submit>{x.saveResponse}</Button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex flex-col items-start gap-4">
                  <p className="text-[13px] leading-[1.55] text-muted">{x.triageBody}</p>
                  <Button large primary icon="arrow-right" href="/freelancer/triage">{en.freelancer.triage.start}</Button>
                </div>
              )}
            </Panel>
          )}
          {step === 5 && (
            <Panel title={t.steps[4]} badge={badge}>
              <KycForm />
            </Panel>
          )}
          {step === 6 && (
            <Panel title={t.steps[5]} badge={a?.status === "backed" ? en.public.backed : x.awaitingBacker}>
              <p className="text-sm leading-[1.55] text-fg">{a?.status === "backed" ? x.doneBacked : x.doneReady}</p>
              {s.kyc && <Detail label={en.freelancer.verify.bank} value={`${s.kyc.bank_name} ${s.kyc.account_masked} · MOCK`} />}
              <div><Button large primary icon="arrow-right" href="/freelancer/home">{en.shell.nav.home}</Button></div>
            </Panel>
          )}
          {a?.status === "rejected" && <Notice title={x.rejectedTitle}>{x.rejectedBody}</Notice>}
        </div>
      </div>
    </Workspace>
  );
}
