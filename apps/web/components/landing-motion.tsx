"use client";
// Marketing-site motion (motion/react). Everything respects prefers-reduced-motion: MotionConfig drops transforms
// for those users and keeps fades; scroll-linked opacity is not motion; the reel waits for a play click.
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MotionConfig, motion, useInView, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";

const EASE = [0.23, 1, 0.32, 1] as const; // --ease-out in globals.css
const VIEW = { once: true, amount: 0.2, margin: "0px 0px -6% 0px" } as const;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: 0.7, ease: EASE }}>{children}</MotionConfig>;
}

/** Fixed header: transparent over the hero, blurred surface once the page scrolls. */
export function HeaderShell({ className, children }: { className?: string; children: ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return <header data-solid={solid || undefined} className={className}>{children}</header>;
}

// Hairline grids: the last cell spans the rest of its row, so no empty track shows the line colour.
function useHairline(ref: React.RefObject<HTMLElement>, on: boolean) {
  useEffect(() => {
    const g = ref.current;
    if (!on || !g) return;
    const fit = () => {
      const kids = [...g.children] as HTMLElement[];
      const cols = getComputedStyle(g).gridTemplateColumns.split(" ").filter((w) => parseFloat(w) > 0).length || 1; // auto-fit leaves collapsed 0px tracks
      const rem = kids.length % cols;
      kids.forEach((c) => (c.style.gridColumn = ""));
      if (rem) kids[kids.length - 1].style.gridColumn = `span ${cols - rem + 1} / -1`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(g);
    return () => ro.disconnect();
  }, [ref, on]);
}

type Variant = "rise" | "fade" | "lift";
const FROM: Record<Variant, { y: number; scale?: number }> = { rise: { y: 20 }, fade: { y: 8 }, lift: { y: 12, scale: 0.985 } };

/** Container that staggers its <Item>s once it scrolls into view (or on load, with `now`). */
export function Stagger({ className, children, gap = 0.08, delay = 0, hairline = false, as = "div" }: {
  className?: string; children: ReactNode; gap?: number; delay?: number; hairline?: boolean; as?: "div" | "ol";
}) {
  const ref = useRef<HTMLElement>(null);
  useHairline(ref, hairline);
  const M = as === "ol" ? motion.ol : motion.div;
  return (
    <M ref={ref as never} className={className} initial="hidden" whileInView="shown" viewport={VIEW}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}>
      {children}
    </M>
  );
}

export function Item({ className, children, variant = "rise", as = "div" }: { className?: string; children: ReactNode; variant?: Variant; as?: "div" | "li" }) {
  const { y, scale = 1 } = FROM[variant];
  const d = variant === "fade" ? 0.6 : 0.75;
  const M = as === "li" ? motion.li : motion.div;
  return (
    <M className={className} variants={{
      hidden: { opacity: 0, y, scale },
      shown: { opacity: 1, y: 0, scale: 1, transition: { ease: EASE, duration: d, opacity: { duration: d * 0.7, ease: EASE } } },
    }}>{children}</M>
  );
}

/** Hero heading: words rise one after another (Linear's hero entrance). */
export function Words({ text, className }: { text: string; className?: string }) {
  let n = 0;
  return (
    <h1 className={className}>
      {text.split("\n").map((line, l) => (
        <span key={l} className="block">
          {line.split(" ").map((w, i, a) => (
            <motion.span
              key={n}
              className="inline-block whitespace-pre"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ y: { duration: 0.8, ease: EASE, delay: 0.06 + n * 0.045 }, opacity: { duration: 0.56, ease: EASE, delay: 0.06 + n++ * 0.045 } }}
            >
              {i < a.length - 1 ? `${w} ` : w}
            </motion.span>
          ))}
        </span>
      ))}
    </h1>
  );
}

function ScrollWord({ word, start, progress, lead }: { word: string; start: number; progress: MotionValue<number>; lead: boolean }) {
  const opacity = useTransform(progress, (p) => 0.16 + 0.84 * smoother(clamp01((p - start) / 0.3)));
  return <motion.span style={{ opacity }} className={lead ? "text-bright" : undefined}>{`${word} `}</motion.span>;
}

/** Story paragraph: a long scroll range with wide, overlapping per-word windows, damped, so the glow reads slow and even. */
export function ScrollWords({ lead, body, className }: { lead: string; body: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "end 0.35"] });
  const p = useSpring(scrollYProgress, { stiffness: 40, damping: 16, restDelta: 0.0006 });
  const words = [...lead.split(" ").map((w) => [w, true] as const), ...body.split(" ").map((w) => [w, false] as const)];
  const n = words.length;
  return (
    <h2 ref={ref} className={className}>
      {words.map(([w, isLead], i) => (
        <ScrollWord key={i} word={w} lead={isLead} progress={p} start={(n > 1 ? i / (n - 1) : 0) * 0.7} />
      ))}
    </h2>
  );
}

// Isometric boxes [cx, top-y, half-width, height], drawn back-to-front so later boxes occlude earlier ones.
const FIGS: number[][][] = [
  [[120, 92, 84, 14], [120, 62, 34, 30]], // vault with a bond on top
  [[120, 104, 72, 8], [120, 78, 72, 8], [120, 52, 72, 8]], // milestones, stacked
  [[60, 110, 26, 20], [120, 90, 26, 40], [180, 70, 26, 60]], // a growing record
];
const faces = ([cx, ty, a, h]: number[]) => {
  const b = a * 0.577;
  const p = (pts: number[][]) => pts.map((q) => q.join(",")).join(" ");
  return [
    p([[cx - a, ty], [cx, ty + b], [cx, ty + b + h], [cx - a, ty + h]]),
    p([[cx, ty + b], [cx + a, ty], [cx + a, ty + h], [cx, ty + b + h]]),
    p([[cx, ty - b], [cx + a, ty], [cx, ty + b], [cx - a, ty]]),
  ];
};

/** FIG line drawing: each face strokes itself in, then fills to occlude the faces behind it. */
export function Fig({ index }: { index: number }) {
  return (
    <motion.svg viewBox="0 0 240 160" className="my-4 w-full max-w-[260px] self-center overflow-visible text-[#2a2c30]" initial="hidden" whileInView="shown" viewport={VIEW}>
      {FIGS[index].flatMap(faces).map((pts, i) => (
        <motion.polygon
          key={i}
          points={pts}
          className="fill-canvas stroke-current"
          strokeWidth={0.6}
          strokeLinejoin="round"
          variants={{
            hidden: { pathLength: 0, fillOpacity: 0 },
            shown: { pathLength: 1, fillOpacity: 1, transition: { pathLength: { duration: 1.1, ease: EASE, delay: i * 0.06 }, fillOpacity: { duration: 0.5, ease: EASE, delay: 0.52 + i * 0.06 } } },
          }}
        />
      ))}
    </motion.svg>
  );
}

/** A real screenshot that tilts flat as it scrolls into place (damped, gentler on phones). */
export function Shot({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const [tilt, setTilt] = useState(9);
  useEffect(() => setTilt(innerWidth < 640 ? 5 : 9), []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.3"] });
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.0006 });
  const rotateX = useTransform(p, [0, 1], [still ? 0 : tilt, 0]);
  const scale = useTransform(p, [0, 1], [still ? 1 : 0.95, 1]);
  const opacity = useTransform(p, [0, 0.6], [0.35, 1]);
  return (
    <div ref={ref} className="[perspective:1600px]">
      <motion.div style={{ rotateX, scale, opacity, transformOrigin: "50% 0%" }} className="frame">
        <Image src={src} alt={alt} width={2880} height={1800} sizes="(min-width: 1248px) 1200px, 100vw" className="block h-auto w-full rounded-xl bg-surface" />
      </motion.div>
    </div>
  );
}

/** Hero frame: lands from a slight tilt on load. */
export function Landed({ children }: { children: ReactNode }) {
  return (
    <div className="[perspective:2000px]">
      <motion.div
        className="frame"
        style={{ transformOrigin: "50% 0%" }}
        initial={{ opacity: 0, y: 28, rotateX: 10 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 1, ease: EASE, delay: 0.26, opacity: { duration: 0.7, ease: EASE, delay: 0.26 } }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Hero reel (Remotion render of the real screens): plays only while on screen; reduced motion gets controls. */
export function Reel({ label }: { label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const still = useReducedMotion();
  const seen = useInView(ref, { amount: 0.25 });
  useEffect(() => {
    const v = ref.current;
    if (!v || still !== false) return;
    if (seen) v.play().catch(() => {});
    else v.pause();
  }, [seen, still]);
  return (
    <Landed>
      <video
        ref={ref}
        className="block aspect-[16/10] w-full rounded-xl bg-surface object-cover"
        src="/landing/reel.mp4"
        poster="/landing/reel-poster.jpg"
        aria-label={label}
        muted
        loop
        playsInline
        preload={still ? "metadata" : "none"}
        controls={!!still}
      />
    </Landed>
  );
}
