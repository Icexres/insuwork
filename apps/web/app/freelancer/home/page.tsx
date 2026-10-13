import en from "@insuwork/shared/i18n/en.json";
import { MOCK_NPR_PAISA_PER_USDC } from "@insuwork/shared/src/mock-partner";
import { Button, Checklist, DataTable, Detail, Lifecycle, Metrics, Notice, PageHeading, Panel, Split, type Stage, StatusDot } from "@/components/ui";
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
  const g = en.common.stage;
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
  const tone = (m: (typeof all)[number]) => (m.payout ? "muted" : m.status === "active" ? "accent" : m.status === "disputed" ? "danger" : "idle") as "muted" | "accent" | "danger" | "idle";
  const backed = k.backers.length > 0;
  const hasContract = k.commitments.length > 0;

  const stages: Stage[] = [
    { label: "01 / BACKER", title: k.backers[0] ?? x.noBacker, note: backed ? x.guarantee : x.homeEmpty, state: backed ? "done" : "now", tag: backed ? g.done : g.next },
    { label: "02 / CONTRACT", title: k.commitments[0]?.clientName ?? "—", note: hasContract ? fmt(x.payments, { count: all.length }) : "", state: hasContract ? "done" : "todo", tag: hasContract ? g.done : "" },
    current
      ? { label: "03 / DELIVERY", title: `M${current.index + 1} · ${statusText(current)}`, note: dateText(current.due_ts), state: "now", tag: g.now }
      : { label: "03 / DELIVERY", title: lastPaid ? `M${lastPaid.index + 1} ✓` : "—", note: lastPaid ? dateText(lastPaid.released_ts) : "", state: lastPaid ? "done" : "todo", tag: lastPaid ? g.done : "" },
    { label: "04 / BANK CREDIT", title: lastPaid?.payout ? nprText(lastPaid.payout.npr_amount) : "—", note: lastPaid?.payout ? `M${lastPaid.index + 1} · MOCK · ${dateText(lastPaid.payout.credited_at)}` : "", state: lastPaid ? "done" : "todo", tag: lastPaid ? g.last : "" },
  ];
  const nextStep = !s.app?.full_name ? en.freelancer.application.steps[0] : !s.summary ? en.freelancer.application.steps[3] : !s.kyc ? en.freelancer.application.steps[4] : en.freelancer.flow.awaitingBacker.toLowerCase();

  return (
    <Workspace role="freelancer" active="/freelancer/home" crumb={[en.shell.nav.home]}>
      <PageHeading eyebrow={fmt(en.common.eyebrow, { role: "FREELANCER" })} title={fmt(t.title, { name: first })} subtitle={hasContract ? x.homeSubtitle : x.homeEmpty} />
      <Lifecycle stages={stages} />
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
            <Panel side="info" title={t.backer}>
              <p className="text-xl font-medium leading-[1.2] text-bright">{k.backers.join(", ") || "—"}</p>
              <p className="text-pretty text-[13px] leading-[1.55] text-muted">{backed ? x.backerBody : x.noBacker}</p>
            </Panel>
            <Panel side="info" title={t.profile}>
              {s.kyc ? (
                <>
                  <p className="break-all font-mono text-xs text-fg">{fmt(en.public.url, { ref: s.kyc.freelancer_ref.slice(0, 12) })}</p>
                  <div><Button href={`/p/${s.kyc.freelancer_ref}`}>{t.open}</Button></div>
                  <p className="text-xs leading-normal text-faint">{t.profileHint}</p>
                </>
              ) : <p className="text-[13px] text-muted">{x.profileAfterKyc}</p>}
            </Panel>
            <Panel side="info" title={t.journey}>
              <Checklist items={[
                { label: x.journey.applied, state: s.app?.full_name ? "done" : "current" },
                { label: x.journey.interview, state: s.summary ? "done" : s.app?.full_name ? "current" : "todo" },
                { label: x.journey.ready, state: s.app?.status === "ready" || s.app?.status === "backed" ? "done" : "todo" },
                { label: x.journey.verified, state: s.kyc ? "done" : "todo" },
              ]} />
            </Panel>
          </>
        }
      >
        {current?.status === "disputed" && <Notice title={x.underReview}>{x.claimNote}</Notice>}
        {!hasContract ? (
          <Panel dashed title={x.noContracts}>
            <p className="max-w-[52ch] text-[13px] leading-[1.55] text-muted">
              {x.noContractsBody} <span className="text-fg">{fmt(x.nextStep, { step: nextStep })}</span>
            </p>
            <div><Button primary icon="arrow-right" href="/freelancer">{x.continueApplication}</Button></div>
          </Panel>
        ) : k.commitments.map((c) => (
          <Panel key={c.pubkey} title={fmt(t.contract, { client: c.clientName })} badge={t.mockPayments}>
            <DataTable
              columns={en.common.paymentColumns}
              rows={c.milestones.map((m) => [
                `M${m.index + 1}`,
                [dateText(m.due_ts), m.payout ? `${x.credited} ${dateText(m.payout.credited_at)}` : ""],
                m.payout ? nprText(m.payout.npr_amount) : `≈ ${nprText(npr(m.amount))}`,
                <StatusDot key="s" tone={tone(m)}>{statusText(m)}</StatusDot>,
              ])}
            />
            {BigInt(c.vest_amount) > 0n && <Detail label={x.vest} value={c.vestPayout ? nprText(c.vestPayout.npr_amount) : `≈ ${nprText(npr(c.vest_amount))} · ${c.vest_status}`} />}
            <p className="text-pretty text-xs leading-[1.55] text-faint">{en.common.fxNote}</p>
          </Panel>
        ))}
        {hasContract && <Statement name={s.app?.full_name ?? v.name} kyc={s.kyc} contracts={k.commitments} npr={npr} />}
      </Split>
    </Workspace>
  );
}

/** Printable income statement: received MOCK credits only; scheduled payments listed apart as estimates. */
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
  const row = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-3";

  return (
    <Panel title={t.title} action={<PrintButton>{t.print}</PrintButton>}>
      <p className="text-[13px] text-muted">{t.subtitle}</p>
      <article className="print-area flex flex-col gap-5 rounded-lg bg-paper p-[clamp(18px,4vw,40px)] leading-[1.6] text-ink">
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-xl">{en.app.name}</p>
            <p className="text-[13px] text-ink-2">{t.docTitle}</p>
          </div>
          <div>
            <p className="text-xs text-ink-2">{fmt(t.issued, { date: today })}</p>
            <p className="font-mono text-[11px]">{t.mockData}</p>
          </div>
        </div>
        {rule}
        <div className="grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
          <div>
            <p className="text-[11px] text-ink-2">{t.holder}</p>
            <p className="text-[15px]">{name}</p>
            {kyc && <p className="text-xs">{`${kyc.bank_name} · ${kyc.account_masked}`}</p>}
          </div>
          <div>
            <p className="text-[11px] text-ink-2">{t.payer}</p>
            <p className="text-[15px]">{[...new Set(contracts.map((c) => c.clientName))].join(", ") || "—"}</p>
            <p className="text-xs">{t.payerBody}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className={`${row} text-[11px] text-ink-2`}>{t.columns.map((c, i) => <span key={c} className={i === 2 ? "text-right" : ""}>{c}</span>)}</div>
          {rule}
          {credits.length === 0 && <p className="text-[13px] text-ink-2">{t.empty}</p>}
          {credits.map((c) => (
            <div key={c.at + c.what} className={`${row} text-[13px]`}>
              <span>{dateText(c.at)}</span>
              <span>{c.what}</span>
              <span className="text-right font-mono">{nprText(c.npr)}</span>
            </div>
          ))}
          {rule}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px]">{t.total}</span>
            <span className="font-mono text-lg">{nprText(credits.reduce((a, c) => a + c.npr, 0n))}</span>
          </div>
        </div>
        {remaining.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded bg-paper-2 px-4 py-3.5">
            <p className="text-[13px]">{t.remaining}</p>
            {remaining.map((r) => <p key={r} className="font-mono text-xs text-ink-2">{r}</p>)}
          </div>
        )}
        <p className="text-pretty text-[11px] text-ink-2">{t.disclaimer} {t.pilotCopy}</p>
      </article>
      <p className="text-xs text-faint">{t.receivedNotice}</p>
    </Panel>
  );
}
