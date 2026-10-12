import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Icon } from "@/components/ui";
import { HeaderShell } from "@/components/landing-motion";

// Marketing-site header and footer, shared by the landing page and the /how, /backers, /clients, /freelancers pages.
const t = en.landing;
export type SitePage = "home" | "how" | "backers" | "clients" | "freelancers";
const NAV = [["how", t.nav.how], ["backers", t.nav.backers], ["clients", t.nav.clients], ["freelancers", t.nav.freelancers]] as const;

export const pill = "press inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13px]";
export const accentPill = "bg-accent font-medium text-canvas hover:text-canvas hover:brightness-[1.06] motion-safe:[transition:transform_160ms_var(--ease-out),filter_160ms_var(--ease-out)]";
const brand = "press flex items-center gap-2 whitespace-nowrap text-[15px] font-medium text-bright";

export function SiteHeader({ active }: { active: SitePage }) {
  return (
    <HeaderShell className="content-grid fixed z-50 [inset-inline:0] [inset-block-start:0] [border-block-end:0.5px_solid_transparent] [transition:background-color_280ms_var(--ease-out),border-color_280ms_var(--ease-out)] data-[solid]:bg-[rgb(8_9_10/0.72)] data-[solid]:backdrop-blur-[16px] data-[solid]:backdrop-saturate-[1.4] data-[solid]:[border-block-end-color:theme(colors.hair)]">
      <div className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className={brand}><Icon name="layers" size={20} />{en.app.name}</Link>
        <nav className="flex items-center gap-1 text-[13px] text-muted">
          {NAV.map(([k, l]) => (
            <Link key={k} href={`/${k}`} aria-current={active === k ? "page" : undefined} className={`${pill} hidden hover:text-bright aria-[current]:text-bright md:inline-flex`}>{l}</Link>
          ))}
          <span className="mx-2 hidden h-4 w-px bg-white/[0.08] md:block" />
          <Link href="/login" className={`${pill} hover:text-fg`}>{t.nav.signIn}</Link>
          <Link href="/login?mode=signup" className={`${pill} ${accentPill}`}>{t.nav.start}</Link>
        </nav>
      </div>
    </HeaderShell>
  );
}

const footLink = "text-[13px] text-muted hover:text-bright motion-safe:transition-colors";

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-[1_1_10rem] flex-col gap-3.5">
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {children}
    </div>
  );
}

export function SiteFooter() {
  return (
    <>
      <section className="content-grid">
        <div className="rule-bs flex flex-col items-center gap-8 text-center [padding-block:clamp(9rem,18vw,18rem)]">
          <h2 className="text-[clamp(2.5rem,4vw+1rem,4.5rem)] font-medium leading-none tracking-[-0.026em] text-bright">
            {t.cta.title.split("\n").map((l) => <span key={l} className="block">{l}</span>)}
          </h2>
          <p className="text-[15px] leading-6 text-muted">{t.cta.body}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/login?mode=signup" className={`${pill} h-9 px-4 ${accentPill}`}>{t.nav.start}</Link>
            <Link href="/login" className={`${pill} h-9 bg-white/[0.04] px-4 text-fg shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.08)] hover:bg-white/[0.07] hover:text-bright`}>{t.nav.signIn}</Link>
          </div>
        </div>
      </section>
      <footer className="content-grid rule-bs">
        <div className="flex flex-col gap-[72px] [padding-block:64px_40px]">
          <div className="flex flex-wrap gap-x-8 gap-y-10">
            <div className="flex min-w-0 flex-[2_1_20rem] flex-col gap-3">
              <Link href="/" className={`${brand} self-start`}><Icon name="layers" size={20} />{en.app.name}</Link>
              <p className="text-[13px] text-faint">{t.site.tagline}</p>
            </div>
            <Col title={t.site.product}>
              <Link href="/how" className={footLink}>{t.nav.how}</Link>
              {t.site.anchors.map(([id, l]) => <Link key={id} href={`/how#${id}`} className={footLink}>{l}</Link>)}
            </Col>
            <Col title={t.site.roles}>
              {NAV.slice(1).map(([k, l]) => <Link key={k} href={`/${k}`} className={footLink}>{l}</Link>)}
            </Col>
            <Col title={t.site.account}>
              <Link href="/login" className={footLink}>{t.nav.signIn}</Link>
              <Link href="/login?mode=signup" className={footLink}>{t.nav.start}</Link>
            </Col>
          </div>
          <div className="rule-bs flex flex-wrap items-end justify-between gap-6 [padding-block-start:24px]">
            <p className="max-w-[640px] text-xs leading-5 text-faint">{`${en.common.pilotBoundaries.title}. ${en.common.pilotBoundaries.body}`}</p>
            <p className="font-mono text-[11px] text-faint">{t.footer}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
