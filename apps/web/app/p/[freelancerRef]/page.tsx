import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Badge, Button, DataTable, Divider, Eyebrow, Icon, Metrics, Notice, Panel } from "@/components/ui";
import { fmt } from "@/lib/demo";
import { publicProfile, short, usd } from "@/lib/data";

// Public, wallet-free. Only successes are shown (AGENTS.md rule 7). Amounts follow the freelancer's
// exact-vs-band choice (E-44).
export const dynamic = "force-dynamic";

const BAND_EDGES = [50, 100, 250, 500, 1_000, 2_000, 5_000];
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default async function PublicProfile({ params }: { params: { freelancerRef: string } }) {
  const t = en.public;
  const ref = decodeURIComponent(params.freelancerRef);
  const d = await publicProfile(ref);
  const band = (amount: bigint) => {
    const i = BAND_EDGES.findIndex((e) => amount < BigInt(e) * 1_000_000n);
    return t.bands[i === -1 ? BAND_EDGES.length : i];
  };
  const initials = (n: string) => n.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const explorer = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-20 items-center justify-between gap-6 border-b-[0.5px] border-line px-6 lg:px-[120px]">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-medium text-white">
          <Icon name="layers" size={25} />
          {en.app.name}
        </Link>
        <nav className="flex items-center gap-7 text-[13px] text-muted">
          <Link href="/voucher" className="hidden hover:text-fg md:inline">{t.nav.backers}</Link>
          <Link href="/client/freelancers" className="hidden hover:text-fg md:inline">{t.nav.clients}</Link>
          <Button href="/login">{t.nav.signIn}</Button>
        </nav>
      </header>

      <main className="flex flex-col gap-8 px-6 py-14 lg:px-[120px]">
        {!d ? (
          <Panel><p className="text-sm text-muted">{t.notFound}</p></Panel>
        ) : (
          <>
            <Eyebrow>{fmt(t.eyebrow, { ref: short(ref) })}</Eyebrow>
            <div className="flex flex-wrap items-center gap-6">
              <Avatar initials={initials(d.name)} size={72} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <h1 className="text-[40px] font-medium leading-[1.2] text-white">{d.name}</h1>
                <p className="text-sm text-muted">{d.sub}</p>
                <p className="font-mono text-xs text-muted">{fmt(t.url, { ref: short(ref) })}</p>
              </div>
              {d.backers.length > 0 && <Badge>{t.backed}</Badge>}
              <Button primary icon="arrow-right" href={`/client/new?ref=${ref}`}>{t.startCommitment}</Button>
            </div>

            <Metrics
              items={[
                { label: t.metrics.deliveries, value: String(d.records.length), note: t.metrics.recordsNote },
                { label: t.metrics.clients, value: String(d.clients), note: t.metrics.clientsNote },
                { label: t.metrics.backers, value: String(d.backers.length), note: d.backers.map((b) => b.name).join(", ") || "—" },
              ]}
            />

            <Panel title={t.backer.title} badge="DEVNET">
              {d.backers.length === 0 && <p className="text-[13px] text-muted">—</p>}
              {d.backers.map((b) => (
                <div key={b.name} className="flex flex-wrap items-center justify-between gap-6">
                  <div className="flex max-w-[660px] flex-col gap-2">
                    <p className="text-xl font-medium leading-[1.2] text-white">{b.name}</p>
                    <p className="text-[13px] text-muted">{t.backer.disclaimer}</p>
                  </div>
                  <div className="flex w-[290px] flex-col gap-2 font-mono">
                    <Eyebrow>{t.backer.band}</Eyebrow>
                    <p className="text-2xl text-fg">{band(b.cap)}</p>
                  </div>
                </div>
              ))}
            </Panel>

            <Panel title={t.records.title} badge={t.records.schema}>
              {d.records.length === 0 ? <p className="text-[13px] text-muted">{t.noRecords}</p> : (
                <DataTable
                  columns={t.records.columns}
                  rows={d.records.map((r) => [
                    day(r.released),
                    r.client,
                    d.shareExact ? `$${usd(r.amount)}` : band(r.amount),
                    r.nprCredit ? [`✓ ${day(r.creditedAt)} · MOCK`, short(r.nprCredit)] : t.pending,
                    <a key="v" className="underline" href={explorer(r.attestation)} target="_blank" rel="noreferrer">{`${short(r.attestation)} ↗`}</a>,
                  ])}
                />
              )}
              <p className="text-xs text-muted">{t.records.footnote}</p>
            </Panel>

            <Notice title={t.notice.title}>{t.notice.body}</Notice>
            <Divider />
            <p className="text-xs text-muted">{t.footer}</p>
          </>
        )}
      </main>
    </div>
  );
}
