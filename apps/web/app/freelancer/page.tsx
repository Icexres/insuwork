import en from "@insuwork/shared/i18n/en.json";
import { Button, Check, Divider, Eyebrow, Field, Notice, PageHeading, Panel, Steps } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, freelancer as d, users } from "@/lib/demo";

// Onboarding stepper, step 1 (Profile). Steps 2–6 are not built yet.
export default function FreelancerApplication() {
  const t = en.freelancer.application;
  const f = t.fields;

  return (
    <Workspace role="freelancer" active="/freelancer" crumb={[en.shell.nav.application]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={t.title} subtitle={t.subtitle} />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex w-full shrink-0 flex-col gap-6 lg:w-[250px]">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <Steps steps={t.steps} current={1} />
          <Notice title={t.paceNotice.title}>{t.paceNotice.body}</Notice>
        </div>
        <form className="flex min-w-0 flex-1 flex-col gap-6">
          <Panel title={t.panel} badge={t.stepBadge}>
            <p className="text-sm text-muted">{t.intro}</p>
            <div className="flex flex-wrap gap-4">
              <Field label={f.fullName} value={users.freelancer.name} />
              <Field label={f.displayName} value={d.displayName} />
            </div>
            <div className="flex flex-wrap gap-4">
              {/* ponytail: free text until the college list exists. */}
              <Field label={f.college} value={d.college} />
              <Field label={f.gradYear} value={d.gradYear} />
            </div>
            <Field label={f.stack} value={d.stack} />
            <Field label={f.bio} value={d.intro} rows={2} />
            <Divider />
            <Check defaultChecked>{t.consent}</Check>
          </Panel>
          <Notice title={t.guaranteeNotice.title}>{t.guaranteeNotice.body}</Notice>
          <div className="flex justify-between pt-2">
            <Button>{en.common.saveAndLeave}</Button>
            <Button primary icon="arrow-right">{t.continue}</Button>
          </div>
        </form>
      </div>
    </Workspace>
  );
}
