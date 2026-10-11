import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Detail, Divider, Eyebrow, Field, Notice, PageHeading, Panel, Steps } from "@/components/ui";
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

  return (
    <Workspace role="freelancer" active="/freelancer" crumb={[en.shell.nav.application]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={t.title} subtitle={t.subtitle} />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex w-full shrink-0 flex-col gap-6 lg:w-[250px]">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <Steps steps={t.steps} current={step} />
          <Notice title={t.paceNotice.title}>{t.paceNotice.body}</Notice>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {step === 1 && (
            <form action={saveProfile} className="flex flex-col gap-6">
              <Panel title={t.panel} badge={fmt(x.stepBadge, { n: 1 })}>
                <p className="text-sm text-muted">{t.intro}</p>
                <div className="flex flex-wrap gap-4">
                  <Field label={f.fullName} name="full_name" value={a?.full_name ?? ""} />
                  <Field label={f.displayName} name="display_name" value={v.name.includes("@") ? "" : v.name} />
                </div>
                <div className="flex flex-wrap gap-4">
                  <Field label={f.college} name="college" value={a?.college ?? ""} />
                  <Field label={f.gradYear} name="grad_year" value={a?.grad_year?.toString() ?? ""} inputMode="numeric" />
                </div>
                <Field label={f.stack} name="skills" value={a?.skills.join(", ") ?? ""} placeholder="React, TypeScript" />
                <Field label={f.bio} name="intro" value={a?.intro ?? ""} rows={2} />
                <Divider />
                <Check name="consent" defaultChecked={!!a}>{t.consent}</Check>
              </Panel>
              <Notice title={t.guaranteeNotice.title}>{t.guaranteeNotice.body}</Notice>
              <div className="flex justify-end pt-2"><Button primary icon="arrow-right" submit>{t.continue}</Button></div>
            </form>
          )}
          {step === 2 && (
            <form action={savePortfolio} className="flex flex-col gap-6">
              <Panel title={t.steps[1]} badge={fmt(x.stepBadge, { n: 2 })}>
                <p className="text-sm text-muted">{x.portfolioBody}</p>
                <Field label={x.portfolio} name="portfolio_urls" value={a?.portfolio_urls.join("\n") ?? ""} rows={3} placeholder="https://…" />
                <Field label={x.github} name="github_handle" value={a?.github_handle ?? ""} placeholder="username" />
              </Panel>
              <div className="flex justify-between pt-2">
                <Button href="/freelancer?step=1">{en.common.back}</Button>
                <Button primary icon="arrow-right" submit>{x.continueBaseline}</Button>
              </div>
            </form>
          )}
          {step === 3 && (
            <form action={saveBaseline} className="flex flex-col gap-6">
              <Panel title={t.steps[2]} badge={fmt(x.stepBadge, { n: 3 })}>
                <p className="text-sm text-muted">{x.baselineBody}</p>
                <Field label={x.baselineOpen} name="open" value={bool(s.baseline?.open_test_or_consultancy)} options={yesNo} />
                <Field label={x.baselineNoc} name="noc" value={bool(s.baseline?.noc_filed)} options={yesNo} />
                <Field label={x.baselineDeposit} name="deposit" value={bool(s.baseline?.consultancy_deposit_paid)} options={yesNo} />
              </Panel>
              <div className="flex justify-between pt-2">
                <Button href="/freelancer?step=2">{en.common.back}</Button>
                <Button primary icon="arrow-right" submit>{x.continueTriage}</Button>
              </div>
            </form>
          )}
          {step === 4 && (
            <Panel title={t.steps[3]} badge={fmt(x.stepBadge, { n: 4 })}>
              {s.summary ? (
                <>
                  <Notice title={x.reviewTitle}>{x.reviewBody}</Notice>
                  <Detail label={x.summary} value="" />
                  <p className="text-[13px] text-muted">{s.summary.summary}</p>
                  <form action={saveResponse} className="flex flex-col gap-3">
                    <Field label={x.response} name="response" value={a?.applicant_response ?? ""} rows={3} placeholder={x.responsePlaceholder} />
                    <div><Button submit>{x.saveResponse}</Button></div>
                  </form>
                  {a && a.retakes_used < 1 && <div><Button href="/freelancer/triage">{x.retake}</Button></div>}
                </>
              ) : (
                <>
                  <p className="text-[13px] text-muted">{x.triageBody}</p>
                  <div><Button primary icon="arrow-right" href="/freelancer/triage">{en.shell.nav.triage}</Button></div>
                </>
              )}
            </Panel>
          )}
          {step === 5 && (
            <Panel title={t.steps[4]} badge={fmt(x.stepBadge, { n: 5 })}>
              <KycForm />
            </Panel>
          )}
          {step === 6 && (
            <Panel title={t.steps[5]} badge={a?.status === "backed" ? en.public.backed : x.awaitingBacker}>
              <p className="text-[13px] text-muted">{a?.status === "backed" ? x.doneBacked : x.doneReady}</p>
              {s.kyc && <Detail label={en.freelancer.verify.bank} value={`${s.kyc.bank_name} ${s.kyc.account_masked} · MOCK`} />}
              <div><Button primary icon="arrow-right" href="/freelancer/home">{en.shell.nav.home}</Button></div>
            </Panel>
          )}
          {a?.status === "rejected" && <Notice title={x.rejectedTitle}>{x.rejectedBody}</Notice>}
        </div>
      </div>
    </Workspace>
  );
}
