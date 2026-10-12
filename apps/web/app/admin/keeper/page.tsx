import { revalidatePath } from "next/cache";
import en from "@insuwork/shared/i18n/en.json";
import { keeperPass } from "@insuwork/keeper";
import { chainKeeperDeps } from "@insuwork/keeper/chain";
import { Button, DataTable, Detail, Eyebrow, Notice, PageHeading, Panel, Split } from "@/components/ui";
import { Workspace } from "@/components/workspace";
import { fmt } from "@/lib/demo";
import { connection, keypairFromEnv } from "@/lib/chain";
import { rules, short, viewer } from "@/lib/data";
import { keeperLog } from "@/lib/disputes";
import { supabaseService } from "@/lib/supabase/server";

// AD-2: keeper run log + run-now (E-47) and the indexer's event log.
export const dynamic = "force-dynamic";

async function runKeeper() {
  "use server";
  const v = await viewer();
  if (v?.role !== "admin") return;
  const result = await keeperPass(await chainKeeperDeps(connection(), supabaseService(), keypairFromEnv("KEEPER_SECRET_KEY")));
  await supabaseService().from("keeper_runs").insert({ trigger: "admin", result });
  revalidatePath("/admin/keeper");
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function KeeperEvents() {
  const t = en.admin.keeper;
  const c = en.common;
  const [{ runs, events }, r] = await Promise.all([keeperLog(), rules()]);
  const keeperKey = process.env.KEEPER_SECRET_KEY ? keypairFromEnv("KEEPER_SECRET_KEY").publicKey.toBase58() : null;
  const balance = keeperKey ? (await connection().getBalance(keypairFromEnv("KEEPER_SECRET_KEY").publicKey)) / 1e9 : null;
  const last = runs[0];

  return (
    <Workspace role="admin" active="/admin/keeper" crumb={[en.shell.nav.keeper]}>
      <PageHeading
        eyebrow={fmt(c.eyebrow, { role: "OPERATOR" })}
        title={t.title}
        subtitle={t.subtitle}
        action={keeperKey ? <form action={runKeeper}><Button primary icon="arrow-right" submit>{t.run}</Button></form> : undefined}
      />
      <Split
        side={
          <>
            <Panel title={t.wallet}>
              <p className="text-[13px] text-muted">{t.walletBody}</p>
              <Detail label={c.wallet} value={keeperKey ? short(keeperKey) : en.disputes.keeperNotSet} />
              <Detail label={c.network} value={en.shell.envDevnet} />
              <Detail label={t.walletLabels.balance} value={balance === null ? "—" : `${balance.toFixed(3)} SOL`} />
              <Detail label={t.walletLabels.mode} value={en.disputes.keeperMode} />
              <Notice title={c.pilotBoundaries.title}>{c.pilotBoundaries.body}</Notice>
            </Panel>
            <Panel title={t.rules}>
              <Detail label={c.claimWindow} value={`${r.claimWindowDays} days`} />
              <Detail label={c.panelRuling} value={`${r.rulingDays} days`} />
              <Detail label={t.ruleLabels.release} value={en.disputes.keeperRelease} />
              <Detail label={t.ruleLabels.unlock} value={en.disputes.keeperUnlock} />
            </Panel>
          </>
        }
      >
        <Panel title={t.overview} badge="E-47">
          <p className="text-sm text-muted">{t.overviewBody}</p>
          <Detail label={t.labels.lastRun} value={last ? `${when(last.ran_at)} · ${last.trigger}` : "—"} />
          <Detail label={t.labels.scanned} value={last ? String(last.result.cranked.length + last.result.vests.length + last.result.skipped) : "—"} />
          <Detail label={t.labels.unlocked} value={last ? `${last.result.cranked.length} + ${last.result.vests.length}` : "—"} />
          <Notice title={t.behaviorNotice.title}>{t.behaviorNotice.body}</Notice>
          <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-line bg-surface p-4">
            <Eyebrow>{t.history}</Eyebrow>
            {runs.length === 0 && <p className="text-[13px] text-muted">—</p>}
            {runs.map((run) => (
              <div key={run.ran_at} className="flex gap-4 text-fg">
                <p className="flex-1 text-[13px]">{`${when(run.ran_at)} · ${run.trigger}`}</p>
                <p className="w-[200px] text-right font-mono text-xs leading-[1.6]">
                  {fmt(en.disputes.runSummary, { cranked: run.result.cranked.length, vests: run.result.vests.length, errors: run.result.errors.length })}
                </p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t.events} badge={en.disputes.eventsBadge}>
          <p className="text-[13px] text-muted">{en.disputes.eventsBody}</p>
          <DataTable
            columns={t.columns}
            rows={events.map((e) => [
              `${e.program}.${e.name}`,
              when(e.received_at),
              e.instruction ?? "—",
              String(e.slot),
              <a key="s" className="text-fg underline" href={`https://explorer.solana.com/tx/${e.sig}?cluster=devnet`} target="_blank" rel="noreferrer">{`${short(e.sig)} ↗`}</a>,
            ])}
          />
        </Panel>
      </Split>
    </Workspace>
  );
}
