import en from "@insuwork/shared/i18n/en.json";
import { Bar, Button, CardLink, PageHeading, Panel, StatusDot } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { clientCommitments, pct, short, usd, viewer } from "@/lib/data";

// The client's commitments (mirror).
export const dynamic = "force-dynamic";

const TONE: Record<string, "accent" | "muted" | "idle"> = { active: "accent", funded: "muted", draft: "muted", completed: "muted", cancelled: "idle" };

export default async function Commitments() {
  const t = en.client.actions;
  const k = en.client.commitment;
  const v = await viewer();
  const list = v?.wallet ? await clientCommitments(v.wallet) : [];
  const status = (s: string) => t.statusLabels[s as keyof typeof t.statusLabels] ?? s;

  return (
    <Workspace role="client" active="/client/commitments" crumb={[en.shell.nav.commitments]}>
      <PageHeading
        eyebrow={fmt(en.common.eyebrow, { role: "CLIENT" })}
        title={en.shell.nav.commitments}
        subtitle={en.client.new.payNote}
        action={<Button primary icon="arrow-right" href="/client/new">{en.shell.nav.newCommitment}</Button>}
      />
      {list.length === 0 ? (
        <Panel dashed>
          <p className="text-sm text-fg">{v?.wallet ? t.none : en.voucher.empty.noWallet}</p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((c) => {
            const salary = BigInt(c.released) + BigInt(c.remaining_salary);
            return (
              <CardLink key={c.pubkey} href={`/client/commitments/${c.pubkey}`} highlight={c.status === "active"}>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-[15px] font-medium text-bright">{c.name}</span>
                  <span className="font-mono text-[11px] text-faint">{short(c.pubkey)}</span>
                </span>
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-xs text-fg">{fmt(k.progress, { done: `$${usd(c.released)}`, total: `$${usd(salary)}` })}</span>
                  <Bar pct={pct(BigInt(c.released), salary)} />
                </span>
                <span className="flex flex-col gap-[3px]">
                  <span className="text-[11px] text-faint">{k.funded}</span>
                  <span className="font-mono text-xs text-fg">{`$${usd(c.total_required)}`}</span>
                </span>
                <span className="flex items-center justify-between gap-3">
                  <StatusDot tone={TONE[c.status] ?? "muted"}>{status(c.status)}</StatusDot>
                  <span className="whitespace-nowrap text-[13px] text-fg">{en.common.open}</span>
                </span>
              </CardLink>
            );
          })}
        </div>
      )}
    </Workspace>
  );
}
