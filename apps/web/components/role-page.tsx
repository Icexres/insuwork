import Image from "next/image";
import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Item, Landed, MotionRoot, Stagger, Words } from "@/components/landing-motion";
import { accentPill, pill, SiteFooter, SiteHeader } from "@/components/site-chrome";

// Marketing role pages (/how, /backers, /clients, /freelancers) and the layout pieces they share with the landing page.
export const display = "font-medium leading-none tracking-[-0.022em] text-bright";
export const section = "py-[clamp(5rem,9vw,8rem)]";
export const twoUp = "grid gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]";
export const eyebrow = "font-mono text-[11px] text-faint";
export const lines = (s: string) => s.split("\n").map((l, i) => <span key={i} className="block">{l}</span>);
const box = "hairline-grid overflow-clip rounded-xl border-[0.5px] border-hair";

export function Facts({ facts }: { facts: string[][] }) {
  return (
    <Stagger hairline className={`${box} [grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))]`} gap={0.06}>
      {facts.map(([k, v]) => (
        <Item key={k} variant="fade" className="flex flex-col gap-3 bg-surface p-5">
          <p className="font-mono text-[11px] uppercase text-faint">{k}</p>
          <p className="text-[15px] text-bright">{v}</p>
        </Item>
      ))}
    </Stagger>
  );
}

type Key = keyof typeof en.landing.pages;
type Sec = { id: string; eyebrow: string; title: string; body: string; steps?: string[]; facts?: string[][]; notice?: { title: string; body: string } };
const CTA_HREF: Record<Key, string> = { how: "/login?mode=signup", backers: "/voucher", clients: "/client/freelancers", freelancers: "/freelancer" };

export function RolePage({ page }: { page: Key }) {
  const p = en.landing.pages[page];
  return (
    <MotionRoot>
      <div className="min-h-screen overflow-x-clip bg-canvas">
        <SiteHeader active={page} />
        <main className="content-grid">
          <section className="flex flex-col gap-8 [padding-block:clamp(8rem,14vw,12rem)_6rem]">
            <p className={eyebrow}>{p.eyebrow}</p>
            <Words text={p.title} className={`${display} text-[clamp(2.75rem,5vw+1rem,4rem)]`} />
            <Stagger className="flex flex-wrap items-end justify-between gap-6 [margin-block-start:1rem]" gap={0.11} delay={0.38}>
              <Item className="max-w-[520px] text-[15px] leading-6 tracking-[-0.011em] text-muted [text-wrap:pretty]">{p.body}</Item>
              <Item variant="fade"><Link href={CTA_HREF[page]} className={`${pill} px-3.5 ${accentPill}`}>{p.cta}</Link></Item>
            </Stagger>
          </section>
          <div className="breakout">
            <Landed>
              <Image src={p.shot} alt={p.alt} width={2880} height={1800} priority sizes="(min-width: 1376px) 1280px, 100vw" className="block h-auto w-full rounded-xl bg-surface" />
            </Landed>
          </div>
          <div className="[padding-block-start:clamp(6rem,12vw,12rem)]">
            {(p.sections as Sec[]).map((s) => (
              <section key={s.id} id={s.id} className={`rule-bs flex flex-col gap-12 [scroll-margin-block-start:4rem] ${section}`}>
                <Stagger className={twoUp} gap={0.12}>
                  <Item className="flex flex-col gap-6">
                    <p className={eyebrow}>{s.eyebrow}</p>
                    <h2 className={`${display} text-[clamp(2.25rem,2.5vw+1.4rem,3rem)]`}>{lines(s.title)}</h2>
                  </Item>
                  <Item variant="fade" className="self-end text-[clamp(1.125rem,0.5vw+1rem,1.375rem)] leading-[1.4] tracking-[-0.012em] text-fg [text-wrap:pretty]">{s.body}</Item>
                </Stagger>
                {s.steps && (
                  <Stagger as="ol" hairline className={`${box} [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]`} gap={0.05}>
                    {s.steps.map((label, i) => (
                      <Item as="li" key={label} variant="fade" className="flex flex-col items-start gap-3.5 bg-surface p-[18px]">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] text-bright shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]">{String(i + 1).padStart(2, "0")}</span>
                        <span className="text-[13px] leading-normal text-fg">{label}</span>
                      </Item>
                    ))}
                  </Stagger>
                )}
                {s.facts && <Facts facts={s.facts} />}
                {s.notice && (
                  <Stagger className="flex">
                    <Item variant="fade" className="flex max-w-[640px] flex-col gap-1.5 rounded-[10px] bg-white/[0.025] [padding:18px_20px] shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.06)]">
                      <p className="text-sm font-medium text-fg">{s.notice.title}</p>
                      <p className="text-[13px] leading-[1.55] text-muted [text-wrap:pretty]">{s.notice.body}</p>
                    </Item>
                  </Stagger>
                )}
              </section>
            ))}
          </div>
        </main>
        <SiteFooter />
      </div>
    </MotionRoot>
  );
}
