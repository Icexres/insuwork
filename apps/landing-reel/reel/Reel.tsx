// Landing hero reel: the real InsuWork screens (apps/web/scripts/landing-shots.ts) walked through in the
// order of the demo — bond, escrow, NPR payout, delivery record, claim. Muted autoplay loop, so no audio.
import en from "@insuwork/shared/i18n/en.json";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as plexMono } from "@remotion/google-fonts/IBMPlexMono";
import { TransitionSeries, springTiming, type TransitionPresentation, type TransitionPresentationComponentProps } from "@remotion/transitions";
import type { ReactNode } from "react";
import { AbsoluteFill, Composition, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";

const { fontFamily: SANS } = inter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const { fontFamily: MONO } = plexMono("normal", { weights: ["400"], subsets: ["latin"] });

const { scene: SCENE, transition: TRANS, exit: EXIT } = theme.timing;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Screenshots are 1440×900 CSS px; `focus` is the panel the scene is about, in those coordinates.
type Shot = { src: string; focus: [x: number, y: number, w: number, h: number]; caption: "top" | "bottom" };
const SHOTS: Shot[] = [
  { src: "voucher-dashboard.jpg", focus: [264, 225, 1136, 149], caption: "bottom" },
  { src: "client-commitment.jpg", focus: [289, 711, 741, 158], caption: "top" },
  { src: "freelancer-home.jpg", focus: [264, 391, 378, 132], caption: "bottom" },
  { src: "public-profile.jpg", focus: [145, 735, 1150, 116], caption: "top" },
  { src: "panel-claim.jpg", focus: [1081, 387, 319, 249], caption: "bottom" },
];
export const DURATION = SHOTS.length * SCENE - (SHOTS.length - 1) * TRANS;

// Window card geometry inside the 1600×1000 frame.
const CARD = { x: 64, y: 64, w: 1472, h: 920 };
const K = CARD.w / 1440;

function BgMesh() {
  const frame = useCurrentFrame();
  const t = (frame / DURATION) * Math.PI * 2; // one full period per loop, so the seam matches
  return (
    <AbsoluteFill style={{ background: theme.colors.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1300, height: 1300, borderRadius: "50%", top: -620, left: -260 + Math.sin(t) * 60, filter: "blur(60px)", background: `radial-gradient(circle, ${theme.colors.mesh}2e, transparent 62%)` }} />
      <div style={{ position: "absolute", width: 1000, height: 1000, borderRadius: "50%", bottom: -560, right: -220 - Math.cos(t) * 50, filter: "blur(70px)", background: `radial-gradient(circle, ${theme.colors.meshAlt}1f, transparent 65%)` }} />
    </AbsoluteFill>
  );
}

// Dip through the background: the old screen is gone before the new one appears, so two UIs never
// double-expose. The incoming scene's own spring entrance gives the scale-through.
const dip = (): TransitionPresentation<Record<string, never>> => ({
  props: {},
  component: ({ children, presentationDirection, presentationProgress: p }: TransitionPresentationComponentProps<Record<string, never>>) => (
    <AbsoluteFill style={{ opacity: presentationDirection === "exiting" ? Math.max(0, 1 - 2 * p) : Math.max(0, 2 * p - 1) }}>{children}</AbsoluteFill>
  ),
});

function Grade() {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ backgroundColor: theme.colors.mesh, mixBlendMode: "soft-light", opacity: 0.12 }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.12), transparent 26%, transparent 78%, rgba(0,0,0,0.16))" }} />
    </AbsoluteFill>
  );
}

function Grain() {
  const frame = useCurrentFrame();
  const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
  return <AbsoluteFill style={{ pointerEvents: "none", backgroundImage: noise, backgroundSize: "220px", backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`, opacity: 0.06, mixBlendMode: "overlay" }} />;
}

function Vignette() {
  return <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,0.32) 100%)" }} />;
}

function Caption({ label, title, place, out }: { label: string; title: string; place: "top" | "bottom"; out: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leave = interpolate(frame, [out - EXIT, out], [0, 1], { ...clamp, easing: theme.ease.in });
  const labelIn = spring({ frame: frame - 8, fps, config: theme.spring.snappy });
  return (
    <div style={{
      position: "absolute", left: CARD.x, width: CARD.w, padding: "56px 56px",
      ...(place === "bottom" ? { bottom: 1000 - CARD.y - CARD.h, background: "linear-gradient(180deg, transparent, rgba(8,9,10,0.94) 55%)" } : { top: CARD.y, background: "linear-gradient(0deg, transparent, rgba(8,9,10,0.94) 55%)" }),
      paddingTop: place === "bottom" ? 140 : 48, paddingBottom: place === "top" ? 140 : 48,
      borderRadius: place === "top" ? "18px 18px 0 0" : "0 0 18px 18px",
      opacity: 1 - leave, transform: `translateY(${leave * -18}px)`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: "0.04em", color: theme.colors.textDim, opacity: labelIn, transform: `translateY(${interpolate(labelIn, [0, 1], [12, 0])}px)` }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 14, fontFamily: SANS, fontWeight: 600, fontSize: 52, letterSpacing: "-0.03em", lineHeight: 1.05, color: theme.colors.text }}>
        {title.split(" ").map((w, i) => {
          const p = spring({ frame: frame - 12 - i * 3, fps, config: theme.spring.snappy });
          return <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${interpolate(p, [0, 1], [28, 0])}px)`, filter: `blur(${interpolate(p, [0, 1], [6, 0])}px)` }}>{w}</span>;
        })}
      </div>
    </div>
  );
}

function Scene({ shot, index, last, children }: { shot: Shot; index: number; last: boolean; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: theme.spring.smooth });
  const exit = last ? interpolate(frame, [SCENE - EXIT, SCENE - 2], [0, 1], { ...clamp, easing: theme.ease.in }) : 0;
  // Ken Burns toward the focus panel; alternate in/out between consecutive shots.
  const [fx, fy, fw, fh] = shot.focus;
  const zoom = interpolate(frame, [0, SCENE], index % 2 ? [1.07, 1.0] : [1.0, 1.07], { ...clamp, easing: theme.ease.inOut });
  const ring = spring({ frame: frame - 26, fps, config: theme.spring.snappy });
  const breathe = 0.75 + Math.sin(frame / 9) * 0.25;
  return (
    <AbsoluteFill style={{ opacity: 1 - exit }}>
      <div style={{
        position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, borderRadius: 18, overflow: "hidden",
        border: `1px solid ${theme.colors.edge}`, background: theme.colors.surface, boxShadow: "0 40px 80px -20px rgba(0,0,0,0.7)",
        opacity: enter, transform: `translateY(${interpolate(enter, [0, 1], [36, 0]) - exit * 30}px) scale(${interpolate(enter, [0, 1], [0.965, 1])})`,
      }}>
        <div style={{ position: "absolute", inset: 0, transformOrigin: `${((fx + fw / 2) * K / CARD.w) * 100}% ${((fy + fh / 2) * K / CARD.h) * 100}%`, transform: `scale(${zoom})` }}>
          <Img src={staticFile(shot.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", left: fx * K - 8, top: fy * K - 8, width: fw * K + 16, height: fh * K + 16, borderRadius: 16,
            border: `2px solid ${theme.colors.primary}`, boxShadow: `0 0 ${36 * breathe}px ${theme.colors.glow}, inset 0 0 ${18 * breathe}px ${theme.colors.glow}`,
            opacity: ring, transform: `scale(${interpolate(ring, [0, 1], [1.05, 1])})`,
          }} />
        </div>
      </div>
      {children}
    </AbsoluteFill>
  );
}

export function Reel() {
  return (
    <AbsoluteFill style={{ background: theme.colors.bg }}>
      <BgMesh />
      <TransitionSeries>
        {SHOTS.flatMap((shot, i) => {
          const last = i === SHOTS.length - 1;
          const c = en.landing.reel[i];
          const seq = (
            <TransitionSeries.Sequence key={shot.src} durationInFrames={SCENE}>
              <Scene shot={shot} index={i} last={last}>
                <Caption label={c.label} title={c.title} place={shot.caption} out={last ? SCENE - 2 : SCENE - TRANS + 4} />
              </Scene>
            </TransitionSeries.Sequence>
          );
          return last ? [seq] : [seq, <TransitionSeries.Transition key={`t${i}`} presentation={dip()} timing={springTiming({ config: theme.spring.calm, durationInFrames: TRANS })} />];
        })}
      </TransitionSeries>
      <Grade />
      <Grain />
      <Vignette />
    </AbsoluteFill>
  );
}

export function Root() {
  const { width, height, fps } = theme.size;
  return <Composition id="Reel" component={Reel} durationInFrames={DURATION} fps={fps} width={width} height={height} />;
}
