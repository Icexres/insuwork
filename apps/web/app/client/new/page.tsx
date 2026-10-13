import en from "@insuwork/shared/i18n/en.json";
import { PageHeading } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { NewCommitmentWizard } from "@/components/client-actions";
import { backedFreelancers, rules } from "@/lib/data";
import devnet from "../../../../../deployments/devnet.json";

// CL-1/CL-2/CL-4 wizard. Releases go only to the registered partner (AGENTS.md rule 3).
export const dynamic = "force-dynamic";

export default async function NewCommitment({ searchParams }: { searchParams: { ref?: string } }) {
  const t = en.client.new;
  const [list, r] = await Promise.all([backedFreelancers(), rules()]);
  const options = list.map((f) => ({
    ref: f.ref, name: f.name,
    backings: f.backings.map((b) => ({ vault: b.vault, backing: b.backing, voucherName: b.voucherName, cap: b.cap.toString(), locked: b.locked.toString() })),
  }));

  return (
    <Workspace role="client" active="/client/new" crumb={[en.shell.nav.newCommitment]}>
      <PageHeading eyebrow={t.eyebrow} title={t.title} subtitle={en.client.actions.subtitle} />
      <NewCommitmentWizard
        freelancers={options}
        preselect={options.some((o) => o.ref === searchParams.ref) ? searchParams.ref : undefined}
        rules={{ premiumBps: r.premiumBps, feeBps: r.feeBps, shareBps: r.shareBps, mint: r.mint, partner: devnet.mockPartner.wallet }}
      />
    </Workspace>
  );
}
