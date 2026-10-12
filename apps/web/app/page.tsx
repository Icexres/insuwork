import Link from "next/link";
import en from "@insuwork/shared/i18n/en.json";
import { Badge } from "@/components/ui";
import { Fig, Item, MotionRoot, Reel, ScrollWords, Shot, Stagger, Words } from "@/components/landing-motion";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { display, eyebrow, Facts, lines, section, twoUp } from "@/components/role-page";

// Landing (UX-FLOWS `/`): the Sita story + three role CTAs. Layout grammar follows linear.app's
// marketing site: blurred fixed header, tight-tracked display type, numbered two-column sections,
// FIG-labelled line drawings, hairline grids. Screens are real captures (scripts/landing-shots.ts);
// the hero reel is rendered from them by apps/landing-reel.
const t = en.landing;
const ROLE_HREF = ["/voucher", "/client/freelancers", "/freelancer"];

export default function Home() {
  return (
    <MotionRoot>
      <div className="min-h-screen overflow-x-clip bg-canvas">
        <SiteHeader active="home" />
        <main className="content-grid">
          <section className="flex flex-col gap-12 [padding-block:clamp(8rem,14vw,12rem)_6rem]">
            <Words text={t.hero.title} className={`${display} text-[clamp(2.75rem,5vw+1rem,4rem)]`} />
            <Stagger className="flex flex-wrap items-end justify-between gap-6" gap={0.11} delay={0.38}>
              <Item className="max-w-[520px] text-[15px] leading-6 tracking-[-0.011em] text-muted [text-wrap:pretty]">{t.hero.body}</Item>
              <Item variant="fade" className="flex items-center gap-2 text-[13px] text-muted"><Badge>{t.hero.tag}</Badge>{t.hero.tagText}</Item>
            </Stagger>
          </section>
          <div className="breakout">
            <Reel label={t.reelLabel} />
          </div>

          <section className="[padding-block:clamp(10rem,20vw,24rem)_clamp(5rem,9vw,8rem)]">
            <ScrollWords
              lead={t.story.lead}
              body={t.story.body}
              className="max-w-[1000px] text-[clamp(1.875rem,3vw+1rem,3rem)] font-medium leading-[1.15] tracking-[-0.022em] text-muted"
            />
            <Stagger hairline className="hairline-grid rule-bs [margin-block-start:clamp(6rem,11vw,12rem)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]" gap={0.11}>
              {t.roles.map((r, i) => (
                <Item key={r.fig} variant="lift" className="flex flex-col gap-4 bg-canvas py-6 [padding-inline:clamp(0px,(100vw-767px)*1000,24px)]">
                  <p className={eyebrow}>{r.fig}</p>
                  <Fig index={i} />
                  <p className="text-[15px] font-medium text-bright">{r.title}</p>
                  <p className="text-[15px] leading-6 text-muted [text-wrap:pretty]">{r.body}</p>
                  <Link href={ROLE_HREF[i]} className="press inline-flex items-center gap-1 self-start whitespace-nowrap text-[13px] text-fg [margin-block-start:auto] [padding-block-start:0.5rem] hover:gap-2 hover:text-bright motion-safe:[transition:gap_220ms_var(--ease-out),color_160ms_var(--ease-out),transform_160ms_var(--ease-out)]">
                    {r.cta} <span>→</span>
                  </Link>
                </Item>
              ))}
            </Stagger>
          </section>

          <div id="how" className="[scroll-margin-block-start:4rem]">
            {t.features.map((f) => (
              <section key={f.num} className={`rule-bs flex flex-col gap-14 ${section}`}>
                <Stagger className={twoUp} gap={0.12}>
                  <Item className="flex flex-col gap-6">
                    <p className={eyebrow}>{`${f.num} ${f.label.toUpperCase()}`}</p>
                    <h2 className={`${display} text-[clamp(2.25rem,2.5vw+1.4rem,3rem)]`}>{lines(f.title)}</h2>
                  </Item>
                  <Item variant="fade" className="self-end text-[clamp(1.25rem,0.6vw+1.05rem,1.5rem)] leading-[1.33] tracking-[-0.012em] text-fg [text-wrap:pretty]">{f.body}</Item>
                </Stagger>
                <Shot src={f.shot} alt={f.alt} />
                <Facts facts={f.facts} />
              </section>
            ))}
          </div>
        </main>
        <SiteFooter />
      </div>
    </MotionRoot>
  );
}
