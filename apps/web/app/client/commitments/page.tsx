import en from "@insuwork/shared/i18n/en.json";
import { Button, DataTable, PageHeading, Panel } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { clientCommitments, short, usd, viewer } from "@/lib/data";

// The client's commitments (mirror).
export const dynamic = "force-dynamic";

export default async function Commitments() {
  const t = en.client.actions;
  const v = await viewer();
  const list = v?.wallet ? await clientCommitments(v.wallet) : [];
  const status = (s: string) => t.statusLabels[s as keyof typeof t.statusLabels] ?? s;

  return (
    <Workspace role="client" active="/client/commitments" crumb={[en.shell.nav.commitments]}>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "CLIENT" })}
        title={en.shell.nav.commitments}
        subtitle={en.client.new.payNote}
        action={<Button primary icon="arrow-right" href="/client/new">{en.client.freelancers.start}</Button>}
      />
      <Panel title={en.shell.nav.commitments} badge={en.shell.envDevnet}>
        {list.length === 0 ? (
          <p className="text-[13px] text-muted">{v?.wallet ? t.none : en.voucher.empty.noWallet}</p>
        ) : (
          <DataTable
            columns={[en.client.new.fields.freelancer, en.client.new.totals.fund, en.client.commitment.metrics.released, en.client.commitment.columns[3], ""]}
            rows={list.map((c) => [
              [c.name, short(c.pubkey)],
              `$${usd(c.total_required)}`,
              `$${usd(c.released)}`,
              status(c.status),
              <Button key="o" href={`/client/commitments/${c.pubkey}`}>{t.open}</Button>,
            ])}
          />
        )}
      </Panel>
    </Workspace>
  );
}
