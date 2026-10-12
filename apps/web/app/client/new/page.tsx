import en from "@insuwork/shared/i18n/en.json";
import { Detail, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { NewCommitmentWizard } from "@/components/client-actions";
import { backedFreelancers, rules, short, viewer } from "@/lib/data";
import devnet from "../../../../../deployments/devnet.json";

// CL-1/CL-2/CL-4 wizard. Releases go only to the registered partner (AGENTS.md rule 3).
export const dynamic = "force-dynamic";

export default async function NewCommitment({ searchParams }: { searchParams: { ref?: string } }) {
  const t = en.client.new;
  const v = await viewer();
  const [list, r] = await Promise.all([backedFreelancers(), rules()]);
  const options = list.map((f) => ({
    ref: f.ref, name: f.name,
    backings: f.backings.map((b) => ({ vault: b.vault, backing: b.backing, voucherName: b.voucherName, cap: b.cap.toString(), locked: b.locked.toString() })),
  }));

  return (
    <Workspace role="client" active="/client/new" crumb={[en.shell.nav.newCommitment]}>
      <PageHeading eyebrow={t.eyebrow} title={t.title} subtitle={en.client.actions.subtitle} />
      <Split
        side={
          <>
            <Panel title={t.context}>
              <p className="text-xl font-medium leading-[1.2] text-white">{v?.name}</p>
              <p className="text-[13px] text-muted">{v?.wallet ? short(v.wallet) : "—"}</p>
              <p className="text-[13px] text-muted">{t.contextBody}</p>
            </Panel>
            <Panel title={t.funding}>
              <Detail label={t.totals.premium} value={`${r.premiumBps / 100}%`} />
              <Detail label={t.totals.fee} value={`${r.feeBps / 100}%`} />
              <Detail label={en.common.claimWindow} value={`${r.claimWindowDays} days`} />
              <Notice title={t.partnerValue}>{t.payNote}</Notice>
            </Panel>
            <Panel title={en.common.pilotBoundaries.title} badge={en.shell.envDevnet}>
              <p className="text-[13px] text-muted">{en.common.pilotBoundaries.body}</p>
            </Panel>
          </>
        }
      >
        <NewCommitmentWizard
          freelancers={options}
          preselect={options.some((o) => o.ref === searchParams.ref) ? searchParams.ref : undefined}
          rules={{ premiumBps: r.premiumBps, feeBps: r.feeBps, shareBps: r.shareBps, mint: r.mint, partner: devnet.mockPartner.wallet }}
        />
      </Split>
    </Workspace>
  );
}
