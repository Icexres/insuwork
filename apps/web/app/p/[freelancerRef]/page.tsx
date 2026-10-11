import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Avatar, Badge, Button, DataTable, Divider, Eyebrow, Icon, Lifecycle, Metrics, Notice, Panel } from "@/components/ui";
import { backer, fmt, freelancer, publicProfile as d } from "@/lib/demo";

// Public, wallet-free. Only successes are shown (AGENTS.md rule 7).
export default function PublicProfile({ params }: { params: { freelancerRef: string } }) {
  const t = en.public;
  const ref = decodeURIComponent(params.freelancerRef);

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
          <Link href="/family" className="hidden hover:text-fg md:inline">{t.nav.families}</Link>
          <span className="hidden md:inline">{t.nav.verify}</span>
          <Button>{t.nav.signIn}</Button>
        </nav>
      </header>

      <main className="flex flex-col gap-8 px-6 py-14 lg:px-[120px]">
        <Eyebrow>{fmt(t.eyebrow, { ref })}</Eyebrow>
        <div className="flex flex-wrap items-center gap-6">
          <Avatar initials={freelancer.initials} size={72} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-[40px] font-medium leading-[1.2] text-white">{freelancer.displayName}</h1>
            <p className="text-sm text-muted">{freelancer.bio}</p>
            <p className="font-mono text-xs text-muted">{fmt(t.url, { ref })}</p>
          </div>
          <Badge>{t.backed}</Badge>
          <Button primary icon="arrow-right" href="/client/new">{t.startCommitment}</Button>
        </div>

        <Metrics
          items={[
            { label: t.metrics.deliveries, value: d.deliveries, note: t.metrics.deliveriesNote },
            { label: t.metrics.clients, value: d.clients, note: t.metrics.clientsNote },
            { label: t.metrics.since, value: d.since, note: backer.short },
          ]}
        />

        <Panel title={t.backer.title} badge={t.backer.badge}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex max-w-[660px] flex-col gap-2">
              <p className="text-xl font-medium leading-[1.2] text-white">{backer.name}</p>
              <p className="text-sm text-muted">{backer.sub}</p>
              <p className="text-[13px] text-muted">{t.backer.disclaimer}</p>
            </div>
            <div className="flex w-[290px] flex-col gap-2 font-mono">
              <Eyebrow>{t.backer.band}</Eyebrow>
              <p className="text-2xl text-fg">{backer.band}</p>
            </div>
          </div>
        </Panel>

        <Panel title={t.records.title} badge={t.records.schema}>
          <DataTable columns={t.records.columns} rows={d.records} />
          <p className="text-xs text-muted">{t.records.footnote}</p>
        </Panel>

        <Lifecycle stages={d.lifecycle} />
        <Notice title={t.notice.title}>{t.notice.body}</Notice>
        <Divider />
        <p className="text-xs text-muted">{t.footer}</p>
      </main>
    </div>
  );
}
