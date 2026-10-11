import en from "@insuwork/shared/i18n/en.json";
import { MOCK_NPR_PAISA_PER_USDC } from "@insuwork/shared/src/mock-partner";
import { Badge, Button, DataTable, Detail, Fact, Lifecycle, Metrics, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
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
            <Panel title={t.family} badge={x.comingLater}>
              <p className="text-xs text-muted">{x.familyLater}</p>
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
