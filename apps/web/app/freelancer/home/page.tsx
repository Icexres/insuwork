import en from "@insuwork/shared/i18n/en.json";
import { MOCK_NPR_PAISA_PER_USDC } from "@insuwork/shared/src/mock-partner";
import { Badge, Button, DataTable, Detail, Fact, Lifecycle, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { PrintButton } from "@/components/freelancer-forms";
import { fmt } from "@/lib/demo";
import { viewer } from "@/lib/data";
import { dateText, freelancerContracts, freelancerState, nprText } from "@/lib/freelancer";

// Freelancer status page. Amounts in NPR only; no wallet, no crypto (AGENTS.md rule 1).
export const dynamic = "force-dynamic";

export default async function FreelancerHome() {
  const t = en.freelancer.home;
  const x = en.freelancer.flow;
  const v = await viewer();
  if (!v) return null;
  const [s, k] = await Promise.all([freelancerState(v), freelancerContracts()]);
  const first = v.name.includes("@") ? "" : v.name.split(" ")[0];
  const npr = (usdcBase: string) => (BigInt(usdcBase) * MOCK_NPR_PAISA_PER_USDC) / 1_000_000n;
  const all = k.commitments.flatMap((c) => c.milestones);
  const received = all.reduce((a, m) => a + BigInt(m.payout?.npr_amount ?? 0), 0n)
    + k.commitments.reduce((a, c) => a + BigInt(c.vestPayout?.npr_amount ?? 0), 0n);
  const estimate = all.reduce((a, m) => a + npr(m.amount), 0n);
  const current = all.find((m) => m.status === "active" || m.status === "disputed");
  const lastPaid = [...all].reverse().find((m) => m.payout);
  const statusText = (m: (typeof all)[number]) =>
    m.payout ? x.paidMock : m.status === "active" ? x.inProgress : m.status === "disputed" ? x.underReview : m.status === "pending" ? x.upcoming : x.closed;

  return (
    <Workspace role="freelancer" active="/freelancer/home" crumb={[en.shell.nav.home]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={fmt(t.title, { name: first })} subtitle={k.commitments.length ? x.homeSubtitle : x.homeEmpty} />
      <Lifecycle
        stages={[
          { label: "01 / BACKER", title: k.backers[0] ?? "—", note: k.backers.length ? x.guarantee : x.noBacker },
          { label: "02 / CONTRACT", title: k.commitments[0]?.clientName ?? "—", note: fmt(x.payments, { count: all.length }) },
          { label: "03 / DELIVERY", title: lastPaid ? `M${lastPaid.index + 1} ✓` : "—", note: lastPaid ? dateText(lastPaid.released_ts) : "" },
          { label: "04 / BANK CREDIT", title: lastPaid?.payout ? nprText(lastPaid.payout.npr_amount) : "—", note: lastPaid?.payout ? `MOCK · ${dateText(lastPaid.payout.credited_at)}` : "" },
        ]}
      />
      <Metrics
        items={[
          { label: t.metrics.received, value: nprText(received), note: "MOCK" },
          { label: t.metrics.estimate, value: nprText(estimate), note: x.fxNote },
          { label: t.metrics.current, value: current ? `M${current.index + 1} / ${String(all.length).padStart(2, "0")}` : "—", note: current ? statusText(current) : "" },
        ]}
      />
      <Split
        side={
          <>
            <Panel title={t.backer}>
              <p className="text-xl font-medium leading-[1.2] text-white">{k.backers.join(", ") || "—"}</p>
              <p className="text-[13px] text-muted">{k.backers.length ? x.backerBody : x.noBacker}</p>
            </Panel>
            <Panel title={t.profile}>
              {s.kyc ? (
                <>
                  <p className="font-mono text-[11px] text-fg">{fmt(en.public.url, { ref: s.kyc.freelancer_ref.slice(0, 12) })}</p>
                  <div><Button href={`/p/${s.kyc.freelancer_ref}`}>{t.open}</Button></div>
                  <p className="text-xs text-muted">{t.profileHint}</p>
                </>
              ) : <p className="text-xs text-muted">{x.profileAfterKyc}</p>}
            </Panel>
          </>
        }
      >
        {k.commitments.length === 0 ? (
          <Panel title={x.noContracts}>
            <p className="text-[13px] text-muted">{x.noContractsBody}</p>
            <div><Button href="/freelancer">{en.shell.nav.application}</Button></div>
          </Panel>
        ) : k.commitments.map((c) => (
          <Panel key={c.pubkey} title={fmt(t.contract, { client: c.clientName })} badge={t.mockPayments}>
            <DataTable
              columns={en.common.paymentColumns}
              rows={c.milestones.map((m) => [
                `M${m.index + 1}`,
                [dateText(m.due_ts), m.payout ? `${x.credited} ${dateText(m.payout.credited_at)}` : ""],
                m.payout ? nprText(m.payout.npr_amount) : `≈ ${nprText(npr(m.amount))}`,
                statusText(m),
              ])}
            />
            {BigInt(c.vest_amount) > 0n && <Detail label={x.vest} value={c.vestPayout ? nprText(c.vestPayout.npr_amount) : `≈ ${nprText(npr(c.vest_amount))} · ${c.vest_status}`} />}
            <p className="text-xs text-muted">{en.common.fxNote}</p>
          </Panel>
        ))}
        <Statement name={s.app?.full_name ?? v.name} kyc={s.kyc} contracts={k.commitments} npr={npr} />
        <Panel title={t.journey}>
          <div className="flex flex-wrap gap-4">
            <Fact label={x.journey.applied} value={s.app?.full_name ? "✓" : "—"} />
            <Fact label={x.journey.interview} value={s.summary ? "✓" : "—"} />
            <Fact label={x.journey.ready} value={s.app?.status === "ready" || s.app?.status === "backed" ? "✓" : "—"} />
            <Fact label={x.journey.verified} value={s.kyc ? "✓" : "—"} />
          </div>
          {current?.status === "disputed" && <Notice title={x.underReview}>{x.claimNote}</Notice>}
          <div><Badge>MOCK</Badge></div>
        </Panel>
      </Split>
    </Workspace>
  );
}

/** Printable income statement (was the family view): received MOCK credits only; scheduled payments listed apart as estimates. */
function Statement({ name, kyc, contracts, npr }: {
  name: string;
  kyc: { bank_name: string; account_masked: string } | null;
  contracts: Awaited<ReturnType<typeof freelancerContracts>>["commitments"];
  npr: (usdcBase: string) => bigint;
}) {
  const t = en.freelancer.statement;
  const credits = contracts.flatMap((c) => [
    ...c.milestones.filter((m) => m.payout).map((m) => ({ at: m.payout!.credited_at, what: fmt(t.credit, { client: c.clientName, n: m.index + 1 }), npr: BigInt(m.payout!.npr_amount) })),
    ...(c.vestPayout ? [{ at: c.vestPayout.credited_at, what: fmt(t.vest, { client: c.clientName }), npr: BigInt(c.vestPayout.npr_amount) }] : []),
  ]).sort((a, b) => a.at.localeCompare(b.at));
  const remaining = contracts.flatMap((c) => c.milestones.filter((m) => !m.payout && ["pending", "active", "disputed"].includes(m.status))
    .map((m) => `${dateText(m.due_ts)} · ${fmt(t.credit, { client: c.clientName, n: m.index + 1 })} · ≈ ${nprText(npr(m.amount))}`));
  const rule = <div className="h-px w-full bg-rule" />;
  const today = dateText(new Date().toISOString());

  return (
    <Panel title={t.title} badge={en.mock.badge}>
      <p className="text-[13px] text-muted">{t.subtitle}</p>
      <article className="print-area flex flex-col gap-6 rounded-md bg-paper p-6 leading-[1.6] text-ink md:p-10">
        <div className="flex flex-wrap justify-between gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-[22px]">{en.app.name}</p>
            <p className="text-[13px] text-ink-2">{t.docTitle}</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-ink-2">{fmt(t.issued, { date: today })}</p>
            <p className="font-mono text-[11px]">{t.mockData}</p>
          </div>
        </div>
        {rule}
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-[11px] text-ink-2">{t.holder}</p>
            <p className="text-base">{name}</p>
            {kyc && <p className="text-xs">{`${kyc.bank_name} · ${kyc.account_masked}`}</p>}
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-[11px] text-ink-2">{t.payer}</p>
            <p className="text-base">{[...new Set(contracts.map((c) => c.clientName))].join(", ") || "—"}</p>
            <p className="text-xs">{t.payerBody}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-4 text-[11px] text-ink-2">{t.columns.map((c) => <p key={c} className="flex-1">{c}</p>)}</div>
          {rule}
          {credits.length === 0 && <p className="text-[13px] text-ink-2">{t.empty}</p>}
          {credits.map((c) => (
            <div key={c.at + c.what} className="flex gap-4 text-[13px]">
              <p className="flex-1">{dateText(c.at)}</p>
              <p className="flex-1">{c.what}</p>
              <p className="flex-1 font-mono">{nprText(c.npr)}</p>
            </div>
          ))}
          {rule}
          <div className="flex gap-4">
            <p className="flex-[2] text-base">{t.total}</p>
            <p className="flex-1 font-mono text-xl">{nprText(credits.reduce((a, c) => a + c.npr, 0n))}</p>
          </div>
        </div>
        <p className="text-xs text-ink-2">{t.disclaimer}</p>
        {remaining.length > 0 && (
          <div className="flex flex-col gap-2 bg-paper-2 p-4">
            <p className="text-[13px]">{t.remaining}</p>
            {remaining.map((r) => <p key={r} className="font-mono text-xs">{r}</p>)}
          </div>
        )}
        {rule}
        <p className="text-[10px] text-ink-2">{t.pilotCopy}</p>
      </article>
      <p className="text-xs text-muted">{t.receivedNotice}</p>
      <div><PrintButton>{t.print}</PrintButton></div>
    </Panel>
  );
}
