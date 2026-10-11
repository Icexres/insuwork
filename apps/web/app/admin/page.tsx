import en from "@insuwork/shared/i18n/en.json";
import { Button, Field, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt, operator as d, users } from "@/lib/demo";

// Operator configuration. Payout partner is MOCK and labelled so (AGENTS.md rule 10).
export default function OperatorConfiguration() {
  const t = en.admin.config;
  const p = t.programFields;

  return (
    <Workspace role="admin" active="/admin" crumb={[t.crumb]}>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "OPERATOR" })}
        title={t.title}
        subtitle={t.subtitle}
        action={<Button primary icon="arrow-right">{t.apply}</Button>}
      />
      <Split
        side={
          <>
            <Panel title={t.sidebar} badge={en.shell.envDevnet}>
              <p className="text-sm text-muted">{t.sidebarBody}</p>
              <Field label={t.sidebarFields.wallet} value={users.admin.wallet} />
              <Field label={t.sidebarFields.treasury} value={d.treasury} />
              <Field label={t.sidebarFields.operator} value={users.admin.name} />
              <Field label={t.sidebarFields.network} value={d.network} />
            </Panel>
            <Panel title={t.allowlist} badge={fmt(t.members, { count: d.allowlist.length })}>
              <ul className="flex flex-col gap-3">
                {d.allowlist.map((m) => (
                  <li key={m.meta} className="flex items-center gap-3 rounded-md border-[0.5px] border-line bg-surface p-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-[13px] font-medium text-fg">{m.name}</p>
                      <p className="font-mono text-[11px] text-muted">{m.meta}</p>
                    </div>
                    <Button>{t.remove}</Button>
                  </li>
                ))}
              </ul>
              <Field label={t.addMember} placeholder={t.addPlaceholder} />
              <div><Button>{t.addMember}</Button></div>
            </Panel>
            <Panel title={en.common.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{en.common.pilotBoundaries.body}</p>
            </Panel>
          </>
        }
      >
        <Panel title={t.program} badge={en.shell.envDevnet}>
          <p className="text-sm text-muted">{t.programBody}</p>
          <Field label={p.minBond} value={d.program.minBond} />
          <Field label={p.leverage} value={d.program.leverage} />
          <Field label={p.premium} value={d.program.premium} />
          <Field label={p.fee} value={d.program.fee} />
          <Field label={p.claimWindow} value={d.program.claimWindow} />
          <Field label={p.ruling} value={d.program.ruling} />
          <Notice title={t.assumptions.title}>{t.assumptions.body}</Notice>
        </Panel>
        <Panel title={t.partner} badge={en.mock.badge}>
          <p className="text-sm text-muted">{d.partner.summary}</p>
          <Field label={t.partnerFields.name} value={d.partner.name} />
          <Field label={t.partnerFields.wallet} value={d.partner.wallet} />
          <Field label={t.partnerFields.note} value={d.partner.note} />
        </Panel>
        <Panel title={t.oracle} badge={t.oracleBadge}>
          <p className="text-sm text-muted">{d.oracle.key}</p>
          <Field label={t.oracleFields.name} value={d.oracle.key} />
          <Field label={t.oracleFields.note} value={d.oracle.note} />
        </Panel>
        <Panel title={t.authority} badge={d.authority.badge}>
          <p className="text-sm text-muted">{t.authorityBody}</p>
          <Field label={t.authorityField} value={d.authority.note} />
        </Panel>
      </Split>
    </Workspace>
  );
}
